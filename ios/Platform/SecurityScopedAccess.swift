import Foundation

final class SecurityScopedAccess {
  private let url: URL
  private let acquired: Bool
  private var released = false
  private let lock = NSLock()

  init?(url: URL, policy: String = "auto") {
    self.url = url
    switch policy {
    case "required":
      let a = url.startAccessingSecurityScopedResource()
      guard a else { return nil }
      self.acquired = true
    case "disabled":
      self.acquired = false
    default:
      self.acquired = url.startAccessingSecurityScopedResource()
    }
  }

  deinit {
    release()
  }

  func release() {
    lock.lock()
    defer { lock.unlock() }
    guard acquired, !released else { return }
    released = true
    url.stopAccessingSecurityScopedResource()
  }
}
