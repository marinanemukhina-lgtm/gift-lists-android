import {notFound} from 'next/navigation';
import Client from '../../client';
export default async function Guest({params}:{params:Promise<{shareCode:string}>}){const {shareCode}=await params;if(!/^[a-f0-9]{32}$/.test(shareCode))notFound();return <Client initialShareCode={shareCode}/>;}
