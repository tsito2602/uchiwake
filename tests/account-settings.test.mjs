import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const {outputFiles}=await build({stdin:{contents:`
  import {createElement} from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {AccountSettings} from './src/auth';
  export const render=user=>renderToStaticMarkup(createElement(AccountSettings,{user}));
`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'}});
const bundle=outputFiles[0].text.replace(/from "([^"]+)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {render}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));

test('アカウントにはメールとアイコンを表示し、名前や編集フォームは表示しない',()=>{
  for(const avatarUrl of [undefined,'https://lh3.googleusercontent.com/a']) {
    const html=render({id:'one',email:'member@example.test',name:'Googleのアカウント名',avatarUrl});
    assert.ok(html.includes('member@example.test'));
    assert.doesNotMatch(html,/表示名|Googleのアカウント名|<form|<input|nickname/);
    assert.match(html,avatarUrl?/<img class="account-avatar"/:/<span class="account-avatar"/);
  }
});
