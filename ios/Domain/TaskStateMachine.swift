import Foundation

final class TaskStateMachine: @unchecked Sendable {
  enum State: String {
    case idle, running, cancelling, succeeded, failed, cancelled
    var isTerminal: Bool {
      switch self {
      case .succeeded, .failed, .cancelled: return true
      case .idle, .running, .cancelling: return false
      }
    }
  }

  private let lock = NSLock()
  private var _state: State = .idle

  var state: State {
    lock.lock()
    defer { lock.unlock() }
    return _state
  }

  func start() throws {
    lock.lock()
    defer { lock.unlock() }
    guard _state == .idle else { throw ArchiveDomainError.invalidState("Task is not idle (state=\(_state.rawValue))") }
    _state = .running
  }

  func cancel() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    switch _state {
    case .idle:
      _state = .cancelled
      return true
    case .running:
      _state = .cancelling
      return true
    case .cancelling, .succeeded, .failed, .cancelled:
      return false
    }
  }

  func succeed() throws {
    lock.lock()
    defer { lock.unlock() }
    guard _state == .running || _state == .cancelling else { throw ArchiveDomainError.invalidState("Task cannot succeed from state=\(_state.rawValue)") }
    _state = .succeeded
  }

  func fail() {
    lock.lock()
    defer { lock.unlock() }
    guard _state == .idle || _state == .running || _state == .cancelling else { return }
    _state = .failed
  }
}
