import type {Metadata,Viewport} from 'next';
import type {ReactNode} from 'react';
import '../../../packages/ui/src/styles.css';
export const metadata:Metadata={title:'Список подарков — личное демо',description:'Четыре повода, ваши пожелания и оформление. Временное некоммерческое демо: только вымышленные данные.',robots:{index:false,follow:false}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#eef1ec'};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="ru"><body>{children}</body></html>;}
