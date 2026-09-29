import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const {outputFiles}=await build({stdin:{contents:`
  import {createElement} from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {AccountSettings} from './src/auth';
  export const render=user=>renderToStaticMarkup(createElement(AccountSettings,{user,signingOut:false,updateProfile:async()=>{}}));
`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'}});
const bundle=outputFiles[0].text.replace(/from "([^"]+)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {render}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));

test('Google名を表示名フォームの初期値にして編集・保存できる',()=>{
  for(const avatarUrl of [undefined,'https://lh3.googleusercontent.com/a']) {
    const html=render({id:'one',email:'member@example.test',name:'Googleのアカウント名',avatarUrl});
    assert.ok(html.includes('member@example.test'));
    assert.match(html,/表示名/);assert.match(html,/<form/);assert.match(html,/value="Googleのアカウント名"/);
    assert.match(html,/autoComplete="nickname"/);assert.match(html,/表示名を保存/);
    assert.doesNotMatch(html,/再ログインして名前を取得/);
    assert.match(html,avatarUrl?/<img class="account-avatar"/:/<span class="account-avatar"/);
  }
});

test('名前を持たない既存アカウントにはGoogleから再取得する入口を表示する',()=>{
  const html=render({id:'one',email:'member@example.test',name:'',avatarUrl:'https://lh3.googleusercontent.com/a'});
  assert.match(html,/<a class="account-reconnect" href="\/api\/auth\/google">Googleで再ログインして名前を取得<\/a>/);
  assert.match(html,/<input[^>]*value=""/);
});
