import {createRoot} from 'react-dom/client';
import {GiftApp} from '../../../packages/ui/src';
import {createBrowserPorts} from '../../web/src/browser-ports';
import '../../../packages/ui/src/styles.css';
const shareCode=window.location.pathname.match(/^\/e\/([a-f0-9]{32})\/?$/)?.[1];
const ports=createBrowserPorts({apiOrigin:window.location.origin,publicOrigin:window.location.origin,demo:true});
createRoot(document.getElementById('root')!).render(<GiftApp ports={ports} initialShareCode={shareCode}/>);
