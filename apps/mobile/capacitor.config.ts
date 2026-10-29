import type {CapacitorConfig} from '@capacitor/cli';
const config:CapacitorConfig={
  appId:'ru.nemukhina.giftlists',appName:'Список подарков',webDir:'dist',
  server:{androidScheme:'https',cleartext:false,errorPath:'unsupported.html'},
  android:{allowMixedContent:false,webContentsDebuggingEnabled:false,loggingBehavior:'none',minWebViewVersion:100},
  plugins:{CapacitorHttp:{enabled:false},CapacitorCookies:{enabled:false}},
};
export default config;
