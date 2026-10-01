// Real components with an emulated visual viewport and iPhone focus events.
// Safari's native keyboard still requires device QA. Set PLAYWRIGHT_MODULE and
// CHROMIUM_PATH if Playwright/Chromium are supplied by the execution environment.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:new URL('..',import.meta.url).pathname,logLevel:'error',server:{host:'127.0.0.1',port:0}});
await server.listen();
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  const viewport=Object.assign(new EventTarget(),{height:844,offsetTop:0,scale:1});
  window.testViewport=viewport;Object.defineProperty(window,'visualViewport',{value:viewport});
 });
 await page.goto(`${server.resolvedUrls.local[0]}tests/browser/panel-keyboard.html`);
 const amounts=page.getByRole('spinbutton'),panel=page.getByRole('dialog').first(),dock=page.locator('.floating-nav-host');
 const resize=async(height,offsetTop=0)=>{
  await page.evaluate(({height,offsetTop})=>{Object.assign(window.testViewport,{height,offsetTop});window.testViewport.dispatchEvent(new Event('resize'));},{height,offsetTop});
  await page.waitForTimeout(100);
 };
 const visible=async field=>{
  await page.waitForTimeout(100);
  const geometry=await field.evaluate(el=>({input:el.getBoundingClientRect().toJSON(),label:el.closest('.field,.statement-edit-field').getBoundingClientRect().top,header:el.closest('.card-panel').querySelector('.card-panel-header').getBoundingClientRect().toJSON(),viewport:window.testViewport.height,scroll:scrollY,transform:el.style.transform}));
  assert.ok(geometry.input.top>=geometry.header.bottom+11,JSON.stringify(geometry));
  assert.ok(geometry.label>=geometry.header.bottom+11,JSON.stringify(geometry));
  assert.ok(geometry.input.bottom<=geometry.viewport-11,JSON.stringify(geometry));
  assert.equal(geometry.scroll,0);assert.equal(geometry.transform,'');
 };
 // Open from a scrolled page without losing its original position on close.
 await page.evaluate(()=>window.scrollTo(0,220));
 await page.getByRole('button',{name:'明細を開く',exact:true}).evaluate(el=>el.click());
 await panel.waitFor();assert.equal(await page.evaluate(()=>scrollY),0);
 const fullPanel=await panel.boundingBox(),fullDock=await dock.boundingBox();
 const first=amounts.nth(0);
 await first.evaluate(el=>el.addEventListener('touchend',event=>{window.lastTouch={prevented:event.defaultPrevented,focused:document.activeElement===el};},{once:true}));
 await first.tap();
 assert.deepEqual(await page.evaluate(()=>window.lastTouch),{prevented:true,focused:true});
 await resize(470);await visible(first);
 assert.deepEqual(await panel.boundingBox(),fullPanel,'Keyboard does not resize or move the panel');
 assert.deepEqual(await dock.boundingBox(),fullDock,'Keyboard does not lift the dock');
 // Accessory next/previous and repeated jumps between distant numeric fields.
 for(const index of [3,17,1,12,0]){
  const field=amounts.nth(index);
  const focusedTop=await field.evaluate(el=>{let top;el.addEventListener('focus',()=>{top=el.getBoundingClientRect().top;},{once:true});el.focus({preventScroll:true});return top;});
  assert.ok(focusedTop<0,'Focus is guarded before Safari can center the page');
  await visible(field);assert.deepEqual(await panel.boundingBox(),fullPanel);assert.deepEqual(await dock.boundingBox(),fullDock);
 }
 // Existing caret taps and swipe/pinch gestures retain their native handling.
 await first.evaluate(el=>el.addEventListener('touchend',event=>window.repeatPrevented=event.defaultPrevented,{once:true}));
 await first.tap();assert.equal(await page.evaluate(()=>window.repeatPrevented),false);
 const gestures=await amounts.nth(1).evaluate(el=>{
  return [1,2].map(count=>{
   const touches=Array.from({length:count},(_,identifier)=>new Touch({identifier,target:el,clientX:100+identifier*30,clientY:200}));
   el.dispatchEvent(new TouchEvent('touchstart',{touches,bubbles:true}));
   const moved=touches.map(t=>new Touch({identifier:t.identifier,target:el,clientX:t.clientX,clientY:t.clientY-60}));
   el.dispatchEvent(new TouchEvent('touchmove',{touches:moved,bubbles:true}));
   const end=new TouchEvent('touchend',{touches:[],changedTouches:moved,bubbles:true,cancelable:true});el.dispatchEvent(end);
   return end.defaultPrevented;
  });
 });assert.deepEqual(gestures,[false,false]);
 // Nested editor: text, date picker, textarea, and releasing only its own lock.
 await page.evaluate(()=>document.activeElement.blur());await resize(844);
 await page.getByRole('button',{name:'子パネル',exact:true}).click();
 const textField=page.getByRole('textbox',{name:'テキスト',exact:true});await textField.tap();await resize(470);await visible(textField);
 const memo=page.getByRole('textbox',{name:'メモ',exact:true});await memo.evaluate(el=>el.focus({preventScroll:true}));await visible(memo);
 const date=page.getByLabel('日付',{exact:true});
 const dateTransform=await date.evaluate(el=>{let value;el.addEventListener('focus',()=>value=el.style.transform,{once:true});el.focus({preventScroll:true});return value;});
 assert.equal(dateTransform,'','Native date pickers are not transformed');
 await page.evaluate(()=>document.activeElement.blur());await resize(844);
 await page.getByRole('button',{name:'子を閉じる',exact:true}).evaluate(el=>el.click());
 await page.getByRole('dialog',{name:'入力テスト'}).waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');
 await amounts.nth(17).evaluate(el=>el.focus({preventScroll:true}));await resize(470);await visible(amounts.nth(17));
 if(process.env.PANEL_SCREENSHOT)await page.screenshot({path:process.env.PANEL_SCREENSHOT});
 await page.evaluate(()=>document.activeElement.blur());await resize(844);
 await page.getByRole('button',{name:'戻る',exact:true}).click();await panel.waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>scrollY),220);assert.equal(await page.evaluate(()=>document.body.style.position),'');
 assert.equal(await page.evaluate(()=>{
  const panel=document.createElement('div');panel.className='card-panel';panel.innerHTML='<input style="transform:translateX(2px)">';document.body.append(panel);
  const input=panel.firstElementChild;input.focus({preventScroll:true});const preserved=input.style.transform==='translateX(2px)';panel.remove();return preserved;
 }),true,'All focus guards are removed after the last panel closes');
 assert.deepEqual(errors,[]);
 // Background locking also runs on Android; its native tap must remain intact.
 const android=await browser.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36'});
 const other=await android.newPage();await other.emulateMedia({reducedMotion:'reduce'});
 await other.goto(`${server.resolvedUrls.local[0]}tests/browser/panel-keyboard.html`);
 await other.getByRole('button',{name:'明細を開く',exact:true}).click();
 const androidField=other.getByRole('spinbutton').first();
 await androidField.evaluate(el=>el.addEventListener('touchend',event=>window.androidTapPrevented=event.defaultPrevented,{once:true}));
 await androidField.tap();
 assert.equal(await other.evaluate(()=>window.androidTapPrevented),false);
 assert.equal(await androidField.evaluate(el=>document.activeElement===el),true);
 await other.evaluate(()=>document.activeElement.blur());
 await other.getByRole('button',{name:'戻る',exact:true}).click();
 await other.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(await other.evaluate(()=>document.body.style.position),'');
 console.log('PASS: real statement/space panels; top, middle and last fields/labels; keyboard open/close; fixed dock/panel; iOS touch focus contract; caret/swipe/pinch; nested text/date/textarea; scroll restoration/cleanup; Android native taps.');
}finally{await browser?.close();await server.close();}
