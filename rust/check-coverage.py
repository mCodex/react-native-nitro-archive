#!/usr/bin/env python3
"""Enforce 90% LLVM line coverage across release-mode Rust unit and integration tests."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
MINIMUM_COVERAGE = 90
# This module is declared under #[cfg(test)] and contains only TAR test cases.
TEST_ONLY_SOURCES = {ROOT / "src/tar_format/tests.rs"}


def command_output(*command, env=None):
    return subprocess.check_output(command, cwd=ROOT, env=env, text=True)


def coverage_tools():
    sysroot = Path(command_output("rustc", "--print", "sysroot").strip())
    target = next(
        line.removeprefix("host: ")
        for line in command_output("rustc", "-vV").splitlines()
        if line.startswith("host: ")
    )
    tools = sysroot / "lib" / "rustlib" / target / "bin"
    profdata, cov = tools / "llvm-profdata", tools / "llvm-cov"
    if not profdata.is_file() or not cov.is_file():
        raise RuntimeError("Install llvm-tools with rustup for the active Rust toolchain.")
    return profdata, cov


def test_binaries(build_dir, env):
    build_env = env | {"LLVM_PROFILE_FILE": str(build_dir / "build-%p-%m.profraw")}
    messages = command_output(
        "cargo",
        "test",
        "--locked",
        "--release",
        "--no-run",
        "--message-format=json",
        env=build_env,
    )
    binaries = [
        Path(message["executable"])
        for line in messages.splitlines()
        if (message := json.loads(line))["reason"] == "compiler-artifact"
        and message["profile"]["test"]
        and message["executable"]
    ]
    if not binaries:
        raise RuntimeError("Cargo reported no host test executables.")
    return binaries


def merge_lcov(report, source_lines):
    source = None
    has_production_lines = False
    for line in report.splitlines():
        if line.startswith("SF:"):
            source = (ROOT / line[3:]).resolve()
        elif line.startswith("DA:") and source in source_lines:
            number, hits = map(int, line[3:].split(",")[:2])
            if number <= 0 or hits < 0:
                raise ValueError(f"Invalid LCOV entry for {source}: {line}")
            lines = source_lines[source]
            lines[number] = lines.get(number, False) or hits > 0
            has_production_lines = True
        elif line == "end_of_record":
            source = None
    return has_production_lines


def collect_coverage(build_dir, profdata, cov, source_lines):
    env = os.environ | {
        "CARGO_TARGET_DIR": str(build_dir / "target"),
        "CARGO_ENCODED_RUSTFLAGS": "-C\x1finstrument-coverage",
    }
    for index, executable in enumerate(test_binaries(build_dir, env)):
        test_dir = build_dir / str(index)
        test_dir.mkdir()
        subprocess.run(
            [executable],
            cwd=ROOT,
            env=env | {"LLVM_PROFILE_FILE": str(test_dir / "%p-%m.profraw")},
            check=True,
        )
        raw_profiles = sorted(test_dir.glob("*.profraw"))
        if not raw_profiles or any(profile.stat().st_size == 0 for profile in raw_profiles):
            raise RuntimeError(f"No usable LLVM profile for {executable.name}.")

        profile = test_dir / "coverage.profdata"
        subprocess.run(
            [profdata, "merge", "-sparse", *raw_profiles, "-o", profile],
            cwd=ROOT,
            check=True,
        )
        # Isolate binaries before merging line IDs so different coverage
        # mappings for the same function do not lose counts.
        result = subprocess.run(
            [
                cov,
                "export",
                "--format=lcov",
                "--instr-profile",
                profile,
                executable,
                "--sources",
                *source_lines,
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
        if result.stderr:
            raise RuntimeError(f"LLVM coverage export for {executable.name}: {result.stderr.strip()}")
        if not merge_lcov(result.stdout, source_lines):
            raise RuntimeError(f"LLVM reported no production lines for {executable.name}.")


def check_scope(name, covered, executable):
    if executable == 0:
        print(f"{name}: missing executable line coverage", file=sys.stderr)
        return False
    meets_threshold = covered * 100 >= executable * MINIMUM_COVERAGE
    status = "PASS" if meets_threshold else "FAIL"
    print(f"{name}: {covered}/{executable} lines ({covered / executable:.2%}) {status}")
    return meets_threshold


def main():
    source_lines = {
        path: {} for path in sorted((ROOT / "src").rglob("*.rs")) if path not in TEST_ONLY_SOURCES
    }
    profdata, cov = coverage_tools()
    with tempfile.TemporaryDirectory(prefix="nitro-rust-coverage-") as temporary:
        collect_coverage(Path(temporary), profdata, cov, source_lines)

    passed = all([
        check_scope(source.relative_to(ROOT), sum(lines.values()), len(lines))
        for source, lines in source_lines.items()
    ])
    covered = sum(sum(lines.values()) for lines in source_lines.values())
    executable = sum(len(lines) for lines in source_lines.values())
    global_passed = check_scope("Rust host total", covered, executable)
    return 0 if passed and global_passed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Rust host coverage failed: {error}", file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            if error.stderr:
                print(error.stderr, file=sys.stderr)
            if error.output:
                print(error.output, file=sys.stderr)
        sys.exit(1)
