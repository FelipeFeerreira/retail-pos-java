import {defineConfig} from 'cypress';
export default defineConfig({
 e2e:{baseUrl:process.env.CYPRESS_BASE_URL||'http://localhost:3000',supportFile:false,defaultCommandTimeout:15000,
 setupNodeEvents(on){on('before:browser:launch',(browser,options)=>{if(browser.name==='electron'){options.preferences.width=1440;options.preferences.height=900;}return options;});}},
 viewportWidth:1366,viewportHeight:768,video:false
});