import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

interface ErrorsContract {
  codes: Record<string, string>
}

interface TaskTransitionsContract {
  states: string[]
  allowedTransitions: Record<string, string[]>
  rules: string[]
}

let exitCode = 0

// 1. Validate errors.json
console.log('Verifying contracts/errors.json...')
const errorsPath = join(ROOT, 'contracts/errors.json')
let errorsJson: ErrorsContract
try {
  const raw = readFileSync(errorsPath, 'utf-8')
  errorsJson = JSON.parse(raw) as ErrorsContract
  if (!errorsJson.codes || typeof errorsJson.codes !== 'object') {
    console.log('  FAIL: errors.json missing "codes" object')
    exitCode = 1
  } else {
    const codes = Object.keys(errorsJson.codes)
    console.log(`  Found ${codes.length} error codes`)
    // Check all codes match expected pattern
    for (const code of codes) {
      if (!/^E_[A-Z_]+$/.test(code)) {
        console.log(`  FAIL: Invalid error code format: "${code}"`)
        exitCode = 1
      }
    }
  }
} catch (err) {
  console.log(`  FAIL: Cannot parse errors.json: ${err}`)
  exitCode = 1
}

// 2. Validate task-transitions.json
console.log('Verifying contracts/task-transitions.json...')
const transitionsPath = join(ROOT, 'contracts/task-transitions.json')
try {
  const raw = readFileSync(transitionsPath, 'utf-8')
  const transitions = JSON.parse(raw) as TaskTransitionsContract
  if (!Array.isArray(transitions.states)) {
    console.log('  FAIL: task-transitions.json missing "states" array')
    exitCode = 1
  } else {
    console.log(`  Found ${transitions.states.length} states: [${transitions.states.join(', ')}]`)

    // Validate allowed transitions reference valid states
    const validStates = new Set(transitions.states)
    for (const [from, toList] of Object.entries(transitions.allowedTransitions)) {
      if (!validStates.has(from)) {
        console.log(`  FAIL: Transition source "${from}" is not a valid state`)
        exitCode = 1
      }
      for (const to of toList) {
        if (!validStates.has(to)) {
          console.log(`  FAIL: Transition target "${to}" is not a valid state`)
          exitCode = 1
        }
      }
    }
    console.log('  All transitions reference valid states')
  }
} catch (err) {
  console.log(`  FAIL: Cannot parse task-transitions.json: ${err}`)
  exitCode = 1
}

// 3. Cross-reference: errors.json codes vs src/errors.ts
console.log('Cross-referencing error codes with src/errors.ts...')
try {
  const errorsTs = readFileSync(join(ROOT, 'src/errors.ts'), 'utf-8')
  if (errorsJson) {
    for (const code of Object.keys(errorsJson.codes)) {
      if (!errorsTs.includes(`'${code}'`)) {
        console.log(`  FAIL: Error code "${code}" in contracts/errors.json not found in src/errors.ts`)
        exitCode = 1
      }
    }
    console.log(`  All ${Object.keys(errorsJson.codes).length} error codes present in src/errors.ts`)
  }
} catch (err) {
  console.log(`  FAIL: Cannot read src/errors.ts: ${err}`)
  exitCode = 1
}

// 4. Cross-reference: task-transitions.json states in native code
console.log('Checking task state references in native code...')
try {
  const transitions = JSON.parse(readFileSync(transitionsPath, 'utf-8')) as TaskTransitionsContract
  for (const state of transitions.states) {
    // Check Swift (ios/)
    const iosFiles = [join(ROOT, 'ios/HybridExtractionTask.swift'), join(ROOT, 'ios/HybridCreationTask.swift'), join(ROOT, 'ios/HybridValidationTask.swift')]
    let foundInSwift = false
    for (const f of iosFiles) {
      try {
        const content = readFileSync(f, 'utf-8')
        if (content.includes(state)) foundInSwift = true
      } catch { /* file may not exist yet */ }
    }
    if (!foundInSwift) {
      console.log(`  Note: state "${state}" not found in iOS Swift tasks`)
    }

    // Check Kotlin (android/)
    const androidFiles = [join(ROOT, 'android/src/main/java/com/mcodex/nitroarchive/HybridExtractionTask.kt'), join(ROOT, 'android/src/main/java/com/mcodex/nitroarchive/HybridCreationTask.kt'), join(ROOT, 'android/src/main/java/com/mcodex/nitroarchive/HybridValidationTask.kt')]
    let foundInKotlin = false
    for (const f of androidFiles) {
      try {
        const content = readFileSync(f, 'utf-8')
        if (content.includes(state)) foundInKotlin = true
      } catch { /* file may not exist yet */ }
    }
    if (!foundInKotlin) {
      console.log(`  Note: state "${state}" not found in Android Kotlin tasks`)
    }
  }
} catch (err) {
  console.log(`  FAIL: Cannot check native state references: ${err}`)
  exitCode = 1
}

if (exitCode === 0) {
  console.log('')
  console.log('All contract parity checks passed.')
} else {
  console.log('')
  console.log('Some checks failed.')
}

process.exit(exitCode)
