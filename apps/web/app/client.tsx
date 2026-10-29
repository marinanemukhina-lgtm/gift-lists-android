'use client';
import {useEffect,useState} from 'react';
import {GiftApp} from '../../../packages/ui/src';
import type {AppPorts} from '../../../packages/domain/src';
import {createBrowserPorts} from '../src/browser-ports';
export default function Client({initialShareCode}:{initialShareCode?:string}){const [ports,setPorts]=useState<AppPorts|null>(null);const [error,setError]=useState('');useEffect(()=>{try{setPorts(createBrowserPorts({apiOrigin:process.env.NEXT_PUBLIC_API_ORIGIN||window.location.origin,publicOrigin:process.env.NEXT_PUBLIC_PUBLIC_ORIGIN||window.location.origin,demo:process.env.NEXT_PUBLIC_DEMO!=='false',supportContact:process.env.NEXT_PUBLIC_SUPPORT_CONTACT}));}catch{setError('Для приложения нужен современный браузер с защищённым хранилищем. Обновите браузер и разрешите данные сайта.');}},[]);return ports?<GiftApp ports={ports} initialShareCode={initialShareCode}/>:<main className="status-page"><h1>Список подарков</h1><p role="status">{error||'Открываем ваши списки…'}</p></main>;}
