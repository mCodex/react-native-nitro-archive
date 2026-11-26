import { createContext, useContext } from 'react'

export const ExampleDirectoryContext = createContext<{
  directory: string
  lastArchive: string
  setLastArchive: (name: string) => void
} | null>(null)

export function useExampleDirectory() {
  const context = useContext(ExampleDirectoryContext)
  if (!context?.directory) {
    throw new Error('The example app did not provide its writable directory.')
  }
  return context
}
