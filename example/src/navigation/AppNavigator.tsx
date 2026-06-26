import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { HomeScreen } from '../screens/HomeScreen'
import { OpenArchiveScreen } from '../screens/OpenArchiveScreen'
import { CreateArchiveScreen } from '../screens/CreateArchiveScreen'
import { ValidateArchiveScreen } from '../screens/ValidateArchiveScreen'
import { AccessPreflightScreen } from '../screens/AccessPreflightScreen'
import { colors } from '../theme'

export type RootStackParamList = {
  Home: undefined
  OpenArchive: undefined
  CreateArchive: undefined
  ValidateArchive: undefined
  AccessPreflight: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '600', color: colors.text },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Nitro Archive' }}
      />
      <Stack.Screen
        name="OpenArchive"
        component={OpenArchiveScreen}
        options={{ title: 'Open Archive' }}
      />
      <Stack.Screen
        name="CreateArchive"
        component={CreateArchiveScreen}
        options={{ title: 'Create Archive' }}
      />
      <Stack.Screen
        name="ValidateArchive"
        component={ValidateArchiveScreen}
        options={{ title: 'Validate Archive' }}
      />
      <Stack.Screen
        name="AccessPreflight"
        component={AccessPreflightScreen}
        options={{ title: 'Check Access' }}
      />
    </Stack.Navigator>
  )
}
