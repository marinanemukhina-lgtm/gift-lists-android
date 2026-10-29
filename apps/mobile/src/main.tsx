import {createRoot} from 'react-dom/client';
import {GiftApp} from '../../../packages/ui/src/index';
import {createNativePorts} from './native';
import '../../../packages/ui/src/styles.css';
import './mobile.css';
const root=createRoot(document.getElementById('root')!);
void createNativePorts().then(ports=>root.render(<GiftApp ports={ports}/>)).catch(()=>root.render(<main className="startup" role="alert"><h1>Не удалось безопасно открыть приложение</h1><p>Обновите Android System WebView и перезапустите приложение. Публикация и доступ к броням закрыты, если защищённое хранилище недоступно. Мы не заменяем его обычной памятью браузера.</p><p>Ваши локальные списки не удалены. Не очищайте данные приложения без сохранённого файла восстановления.</p><button onClick={()=>window.location.reload()}>Повторить</button></main>));
