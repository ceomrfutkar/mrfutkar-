import React from 'react';
import { AppProvider } from './context/AppContext';
import RootNavigator from './navigation/RootNavigator';

export default function App() {
  return (
    <AppProvider>
      <RootNavigator />
    </AppProvider>
  );
}
