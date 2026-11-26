import React, { useState } from 'react'
import { StatusBar } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ExampleDirectoryContext } from './src/exampleDirectory'
import { AppNavigator } from './src/navigation/AppNavigator'

function App({ exampleDirectory }: { exampleDirectory: string }): React.JSX.Element {
  const [lastArchive, setLastArchive] = useState('')
  return (
    <ExampleDirectoryContext.Provider value={{ directory: exampleDirectory, lastArchive, setLastArchive }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </ExampleDirectoryContext.Provider>
  )
}

export default App
