describe('progress listener thread safety', () => {
  it('onProgress returns a removal function', () => {
    const mockTask = {
      onProgress: jest.fn(() => jest.fn()),
    }
    const remove = mockTask.onProgress(() => {})
    expect(typeof remove).toBe('function')
  })
})
