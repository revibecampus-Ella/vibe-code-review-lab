type GitHubRepo={id:number;name:string;full_name:string;html_url:string;homepage?:string|null;description?:string|null;language?:string|null;stargazers_count:number;pushed_at:string;license?:{spdx_id?:string}|null;topics?:string[];archived?:boolean;fork?:boolean};

const topicTerms:Record<string,string[]>={
  "예약 관리":["booking","reservation","appointment"],"교육 플랫폼":["education","learning-platform","lms"],
  "경비 정산":["expense","reimbursement","invoice"],"상담 관리":["crm","case-management","customer-support"],
  "쇼핑몰":["ecommerce","shopping-cart","storefront"],"업무 관리":["project-management","task-management","workflow"]
};
const responseCache=new Map<string,{expires:number,value:unknown}>();
const MAX_CACHE_ENTRIES=100;

export async function POST(request:Request){
  try{
    const body=await request.json();const topic=String(body.topic||"").trim();const language=String(body.language||"").trim();
    const purpose=String(body.purpose||"overall");const minStars=Math.max(0,Math.min(10000,Number(body.minStars)||0));
    if(!topic)return Response.json({error:"찾고 싶은 프로젝트 주제를 입력해 주세요."},{status:400});
    const terms=broaden(topic).slice(0,4);const headers={Accept:"application/vnd.github+json","User-Agent":"Vibe-Code-Review-Lab"};
    pruneCache();
    const cacheKey=JSON.stringify({topic,language,minStars,purpose});const cached=responseCache.get(cacheKey);
    if(cached&&cached.expires>Date.now())return Response.json(cached.value);
    const core=normalizeKeyword(topic);
    const qualifiers=["in:name,description,readme",`stars:>=${minStars}`,"archived:false","fork:false",language?`language:${language}`:""].filter(Boolean);
    const broad=[core,...qualifiers].join(" ");
    const search=await githubSearch(broad,headers);
    if(search.rateLimited)return rateLimitResponse(search.reset);
    if(!search.ok)return Response.json({error:"GitHub 공개 저장소 검색에 실패했습니다. 주소와 잠시 후의 재시도 여부를 확인해 주세요."},{status:502});
    const merged=new Map<number,GitHubRepo>();for(const repo of search.items)if(!repo.archived&&!repo.fork)merged.set(repo.id,repo);
    const items=[...merged.values()].map(repo=>recommend(repo,terms,purpose)).sort((a,b)=>b.suitabilityScore-a.suitabilityScore||b.stars-a.stars||new Date(b.pushedAt).getTime()-new Date(a.pushedAt).getTime()).slice(0,18);
    const value={searchedTerms:terms,totalCandidates:merged.size,expanded:false,note:"이름·설명·README에서 넓게 검색한 뒤 공개 메타데이터를 근거로 적합도를 판단했습니다. 목록은 적합도 점수가 높은 순이며, 점수가 같으면 Star가 높은 순입니다.",items};
    responseCache.set(cacheKey,{expires:Date.now()+10*60*1000,value});
    pruneCache();
    return Response.json(value);
  }catch{return Response.json({error:"GitHub 검색 API에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요. raw.githubusercontent.com은 검색용이 아니라 선택한 Repo의 파일 원문을 읽을 때만 사용합니다."},{status:503})}
}
function broaden(topic:string){const preset=topicTerms[topic];if(preset)return preset;const tokens=topic.toLowerCase().split(/[\s,/#]+/).filter(x=>x.length>1);return[...new Set([topic,...tokens])]}
function normalizeKeyword(topic:string){return topic.replace(/[():"]/g," ").replace(/\s+/g," ").trim()}
function pruneCache(){
  const now=Date.now();
  for(const [key,item] of responseCache)if(item.expires<=now)responseCache.delete(key);
  while(responseCache.size>MAX_CACHE_ENTRIES){
    const oldest=responseCache.keys().next().value;
    if(typeof oldest!=="string")break;
    responseCache.delete(oldest);
  }
}
async function githubSearch(q:string,headers:Record<string,string>){
  const r=await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`,{headers});
  const reset=r.headers.get("x-ratelimit-reset");if(r.status===403||r.status===429)return{ok:false,rateLimited:true,reset,items:[] as GitHubRepo[]};
  if(!r.ok)return{ok:false,rateLimited:false,reset,items:[] as GitHubRepo[]};const data=await r.json();return{ok:true,rateLimited:false,reset,items:(data.items||[]) as GitHubRepo[]}
}
function rateLimitResponse(reset:string|null){
  const time=reset?new Date(Number(reset)*1000).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}):"잠시 후";
  return Response.json({error:`GitHub 공개 검색 요청 한도에 도달했습니다. ${time} 이후 다시 시도해 주세요.`},{status:429})
}
// 링크 모음·학습 자료처럼 진단할 코드가 거의 없는 저장소를 찾아냅니다.
function documentSignals(repo:GitHubRepo){
  const signals:string[]=[];
  if(/(^awesome[-_]?|[-_]awesome$)/i.test(repo.name))signals.push("이름");
  if((repo.topics||[]).some(t=>/^(awesome|awesome-list|awesome-lists|list|lists|resources|curated|curated-list|collection)$/i.test(t)))signals.push("주제 태그");
  if(/(curated list|awesome list|a list of|list of|collection of|curated collection)/i.test(repo.description||""))signals.push("설명");
  if(!repo.language)signals.push("주 언어 미감지");
  return signals;
}
function recommend(repo:GitHubRepo,terms:string[],purpose:string){
  const haystack=`${repo.name} ${repo.description||""} ${(repo.topics||[]).join(" ")}`.toLowerCase();const matched=terms.filter(term=>haystack.includes(term.toLowerCase()));
  let score=Math.min(34,matched.length*12);const reasons:string[]=[];if(matched.length)reasons.push(`주제 관련어 ${matched.slice(0,3).join("·")} 확인`);
  const days=Math.max(0,(Date.now()-new Date(repo.pushed_at).getTime())/86400000);
  if(days<=90){score+=20;reasons.push("최근 3개월 안에 코드가 업데이트됨")}else if(days<=365){score+=13;reasons.push("최근 1년 안에 코드가 업데이트됨")}else if(days<=730){score+=6;reasons.push("최근 2년 안에 코드가 업데이트됨")}
  if(repo.license?.spdx_id&&repo.license.spdx_id!=="NOASSERTION"){score+=10;reasons.push(`라이선스 ${repo.license.spdx_id} 표시`)}
  if(repo.homepage){score+=8;reasons.push("확인 가능한 배포·소개 URL 제공")}if(repo.description)score+=5;if((repo.topics||[]).length>=3)score+=5;
  score+=Math.min(5,Math.log10(Math.max(1,repo.stargazers_count))*1.8);
  const words:Record<string,string[]>={structure:["starter","template","architecture","boilerplate","clean"],test:["test","testing","vitest","jest","playwright","cypress"],security:["security","auth","owasp","permission","vulnerability"],ui:["frontend","ui","dashboard","design-system","responsive"],overall:["fullstack","production","starter","template"]};
  const purposeMatches=(words[purpose]||words.overall).filter(word=>haystack.includes(word));if(purposeMatches.length){score+=Math.min(18,purposeMatches.length*7);reasons.push(`선택 목적 관련 신호 ${purposeMatches.slice(0,3).join("·")} 확인`)}
  const docSignals=documentSignals(repo);
  if(docSignals.length){score-=docSignals.length>=2?35:15;reasons.unshift(`문서·목록형 저장소로 보임 (${docSignals.join(", ")})`)}
  score=Math.round(Math.max(0,Math.min(100,score)));const suitabilityLabel=score>=72?"실습 적합도 높음":score>=52?"검토 가치 있음":"조건 확인 필요";
  if(!repo.homepage)reasons.push("배포 화면 URL은 제공되지 않음");if(!repo.license?.spdx_id)reasons.push("라이선스 표시를 확인하지 못함");
  return{name:repo.name,fullName:repo.full_name,htmlUrl:repo.html_url,homepage:repo.homepage||"",description:repo.description||"프로젝트 설명이 등록되지 않았습니다.",language:repo.language||"미확인",stars:repo.stargazers_count,pushedAt:repo.pushed_at,license:repo.license?.spdx_id||"미확인",topics:(repo.topics||[]).slice(0,6),suitabilityScore:score,suitabilityLabel,reasons:reasons.slice(0,5)}
}
