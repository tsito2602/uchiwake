import { useState } from 'react';
import { UserRound } from 'lucide-react';
import type { Member } from './spaces';

export function MemberAvatar({member}:{member:Member}){
 const [failedUrl,setFailedUrl]=useState<string>();
 return <span className="space-member-avatar" aria-hidden="true">{member.avatarUrl&&member.avatarUrl!==failedUrl
  ?<img src={member.avatarUrl} alt="" referrerPolicy="no-referrer" onError={()=>setFailedUrl(member.avatarUrl)}/>
  :<UserRound size={19}/>}</span>;
}
