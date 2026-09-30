// Rejection sampling avoids bias when the number of members does not divide 2^32.
export function randomMemberIndex(count:number,random:()=>number=()=>crypto.getRandomValues(new Uint32Array(1))[0]):number {
 if(!Number.isSafeInteger(count)||count<1||count>0x100000000)throw new Error('抽選するメンバーを確認してください');
 const limit=Math.floor(0x100000000/count)*count;
 let value:number;do{value=random();}while(value>=limit);
 return value%count;
}
