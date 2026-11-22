import { createContext, useContext } from 'react'

export const ExampleDirectoryContext = createContext<string | null>(null)

export function useExampleDirectory(): string {
  const directory = useContext(ExampleDirectoryContext)
  if (!directory) {
    throw new Error('The example app did not provide its writable directory.')
  }
  return directory
}
