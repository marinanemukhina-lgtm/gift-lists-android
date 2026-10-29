import type {Metadata,Viewport} from 'next';
import type {ReactNode} from 'react';
import '../../../packages/ui/src/styles.css';
export const metadata:Metadata={title:process.env.NEXT_PUBLIC_DEMO==='false'?'Список подарков':'Список подарков — личное демо',description:process.env.NEXT_PUBLIC_DEMO==='false'?'Четыре повода, ваши пожелания и оформление.':'Временное некоммерческое демо: только вымышленные данные.',robots:{index:false,follow:false}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#eef1ec'};
export default function RootLayout({children}:{children:ReactNode}){return <html lang="ru"><body>{children}<footer className="release-legal-links" aria-label="Информация о сервисе"><a href="/privacy">Данные и конфиденциальность</a><a href="/support">Поддержка</a></footer></body></html>;}
