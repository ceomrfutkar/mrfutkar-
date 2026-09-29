import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Copy, Check, FileCode, Folder, Smartphone, Download } from 'lucide-react';

const expoFiles: Record<string, string> = {
  'package.json': `{
  "name": "mrfutkar-retailer",
  "version": "1.0.0",
  "private": true,
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "@react-navigation/native": "^7.1.17",
    "@react-navigation/native-stack": "^7.3.26",
    "@react-navigation/bottom-tabs": "^7.4.7",
    "expo": "~54.0.0",
    "expo-status-bar": "~3.0.8",
    "react": "19.1.0",
    "react-native": "0.81.4",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0"
  }
}`,

  'app.json': `{
  "expo": {
    "name": "MR FUTKAR Retailer",
    "slug": "mrfutkar-retailer",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "android": {
      "package": "com.mrfutkar.retailer"
    }
  }
}`,

  'babel.config.js': `module.exports = function(api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};`,

  'tsconfig.json': `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./src/*"] }
  }
}`,

  'App.tsx': `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/context/AppContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}`,

  'src/navigation/RootNavigator.tsx': `import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import CategoryScreen from '../screens/CategoryScreen';
import ProductListScreen from '../screens/ProductListScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import CartScreen from '../screens/CartScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OrdersScreen from '../screens/OrdersScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LoginScreen from '../screens/LoginScreen';
import ShopSetupScreen from '../screens/ShopSetupScreen';

const Stack=createNativeStackNavigator();
const Tab=createBottomTabNavigator();

function Tabs(){
 return <Tab.Navigator screenOptions={{headerShown:false}}>
   <Tab.Screen name="Home" component={HomeScreen}/>
   <Tab.Screen name="Categories" component={CategoryScreen}/>
   <Tab.Screen name="Orders" component={OrdersScreen}/>
   <Tab.Screen name="Profile" component={ProfileScreen}/>
 </Tab.Navigator>
}

export default function RootNavigator(){
 return <Stack.Navigator>
   <Stack.Screen name="Login" component={LoginScreen} options={{headerShown:false}}/>
   <Stack.Screen name="ShopSetup" component={ShopSetupScreen} options={{title:'Shop Setup'}}/>
   <Stack.Screen name="Main" component={Tabs} options={{headerShown:false}}/>
   <Stack.Screen name="Products" component={ProductListScreen} options={{title:'Products'}}/>
   <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{title:'Product'}}/>
   <Stack.Screen name="Cart" component={CartScreen} options={{title:'My Cart'}}/>
   <Stack.Screen name="Checkout" component={CheckoutScreen} options={{title:'Checkout'}}/>
 </Stack.Navigator>
}`,

  'src/data/products.ts': `export type Product = {
  id:string; name:string; brand:string; category:string; mrp:number; price:number; unit:string; image:string; popular?:boolean;
};
export const categories=['Namkeen','Biscuits','Chocolates','Toffees','Snacks','Beverages','Personal Care','Household'];
export const products:Product[]=[
 {id:'1',name:'Aloo Bhujia 200g',brand:'Haldiram',category:'Namkeen',mrp:65,price:58,unit:'Pack',image:'https://placehold.co/400x300?text=Aloo+Bhujia',popular:true},
 {id:'2',name:'Parle-G 800g',brand:'Parle',category:'Biscuits',mrp:80,price:72,unit:'Pack',image:'https://placehold.co/400x300?text=Parle-G',popular:true},
 {id:'3',name:'Good Day 250g',brand:'Britannia',category:'Biscuits',mrp:50,price:45,unit:'Pack',image:'https://placehold.co/400x300?text=Good+Day',popular:true},
 {id:'4',name:'Chocolate Bar 50g',brand:'Cadbury',category:'Chocolates',mrp:40,price:36,unit:'Piece',image:'https://placehold.co/400x300?text=Chocolate'},
 {id:'5',name:'Kurkure 90g',brand:'Kurkure',category:'Snacks',mrp:30,price:27,unit:'Pack',image:'https://placehold.co/400x300?text=Kurkure'},
 {id:'6',name:'Toffee Assorted',brand:'Futkar',category:'Toffees',mrp:1,price:0.85,unit:'Piece',image:'https://placehold.co/400x300?text=Toffee'}
];`,

  'README.md': `# MR FUTKAR Retailer Frontend — Phase 1

This is a functional Expo + React Native + TypeScript frontend starter for the MR FUTKAR retailer mobile app.

## Included screens
- Mobile login / OTP placeholder
- Shop setup
- Home dashboard
- Categories
- Product listing
- Product detail
- Cart with quantity controls
- Checkout with COD / UPI UI
- Orders
- Profile
- Bottom navigation

## Important
This is the FRONTEND layer. Authentication, Firebase/API, live inventory, real pricing, warehouse assignment, payment gateway, notifications, maps/live delivery tracking, WhatsApp, and admin synchronization are intentionally separated so they can be connected to one central backend.

## Run
1. Install Node.js LTS.
2. In this folder run:
   npm install
   npx expo start
3. Open with Expo Go or Android emulator.`,
};

export default function ExpoCodeModal() {
  const { showCodeModal, setShowCodeModal } = useApp();
  const [selectedFile, setSelectedFile] = useState<string>('src/navigation/RootNavigator.tsx');
  const [copied, setCopied] = useState(false);

  if (!showCodeModal) return null;

  const fileKeys = Object.keys(expoFiles);
  const content = expoFiles[selectedFile] || '';

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-stone-900 text-stone-100 rounded-3xl max-w-3xl w-full h-[88vh] flex flex-col shadow-2xl border border-stone-800 overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-stone-800 flex items-center justify-between bg-stone-950">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-black text-white">
                MR FUTKAR Expo React Native Project
              </h3>
              <p className="text-[11px] text-stone-400">
                Phase 1 Starter Architecture • Preserved File Tree
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCodeModal(false)}
            className="p-1.5 rounded-xl hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area: Sidebar + Code viewer */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0">
          {/* File Selector Sidebar */}
          <div className="w-full sm:w-60 bg-stone-950/80 border-b sm:border-b-0 sm:border-r border-stone-800 p-3 overflow-y-auto text-xs shrink-0">
            <span className="text-[10px] uppercase font-bold text-stone-500 px-2 block mb-2">
              Project Files
            </span>
            <div className="space-y-0.5">
              {fileKeys.map(file => (
                <button
                  key={file}
                  type="button"
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 truncate transition-colors ${
                    selectedFile === file
                      ? 'bg-stone-800 text-emerald-400 font-bold'
                      : 'text-stone-400 hover:bg-stone-900 hover:text-stone-200'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{file}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Code Viewer Panel */}
          <div className="flex-1 flex flex-col min-h-0 bg-stone-900">
            <div className="px-4 py-2 bg-stone-900/90 border-b border-stone-800 flex items-center justify-between text-xs">
              <span className="font-mono text-stone-300 font-bold">{selectedFile}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-md font-semibold transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="flex-1 p-4 overflow-auto font-mono text-xs text-stone-200 leading-relaxed bg-[#141416]">
              <pre className="whitespace-pre">{content}</pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-800 bg-stone-950 flex items-center justify-between text-xs text-stone-400">
          <span>Expo 54 • React Native 0.81 • React 19</span>
          <button
            type="button"
            onClick={() => setShowCodeModal(false)}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors"
          >
            Back to Interactive App
          </button>
        </div>
      </div>
    </div>
  );
}
