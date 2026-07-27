"use client";

import { useEffect, useMemo, useState } from "react";

type Issue={title:string;priority:string;level:string;area:string;location:string;evidence:string;status:string;impact:string;recommendation:string};
type Decision={area:string;verdict:string;tone:"good"|"caution"|"unknown"|"danger";reason:string;evidence:string[];next:string};
type Report={
  repo:{name:string;description:string;descriptionKo:string;readmePath:string;language:string;stars:number;defaultBranch:string;deployUrl:string};summary:string;verdict:string;
  filesRead:string[];foldersSeen:string[];excluded:string[];notAnalyzed:string[];issues:Issue[];
  tests:{files:string[];method:string;status:string};ui:{status:string;evidence:string[];note:string};
  decisions:Decision[];nextActions:string[];currentJudgments:{label:string;value:string;tone:string}[];
  confirmed:string[];unconfirmed:string[];
};
type RepoCandidate={name:string;fullName:string;htmlUrl:string;homepage:string;description:string;language:string;stars:number;pushedAt:string;license:string;topics:string[];suitabilityScore:number;suitabilityLabel:string;reasons:string[]};

const focusItems=["보안 위험","오류 가능성","UI·UX 사용성","코드 구조","테스트 누락","인수인계 용이성"];
const modes=[["quick","빠른 진단","핵심 위험과 다음 행동"],["code","코드 집중","구조·오류·보안·테스트"],["ui","UI 집중","화면·모바일·접근성"],["full","종합 진단","코드와 UI 전체 점검"]];
const tabs=["종합판정","프로젝트 구조","오류 가능성","보안 점검","테스트 현황","UI·UX 점검","인수인계","추가 확인"];
const businessTopics=[
  {id:"infopreneur",label:"1인 인포프리너",description:"지식 콘텐츠 판매·퍼스널 브랜딩",topics:[["digital products","디지털 상품 판매"],["newsletter","뉴스레터"],["landing page","랜딩페이지"],["blog template","콘텐츠 블로그"]]},
  {id:"instructor",label:"교육 강사",description:"학습 관리·예약·설문",topics:[["course management","강의 관리"],["booking system","예약·일정 관리"],["quiz survey","퀴즈·설문"]]},
  {id:"consultant",label:"사회적기업 컨설턴트",description:"고객 진단·프로젝트·성과 관리",topics:[["lightweight crm","고객관리 CRM"],["kanban","칸반·프로젝트 관리"],["dashboard","성과 대시보드"]]}
];
const lightOptions=[["jamstack","정적·경량 구조"],["static site generator","정적 사이트 생성기"],["notion api","노션 연동"],["google sheets api","구글 시트 연동"],["markdown","Markdown 관리"]];

export default function Home(){
  const [fontScale,setFontScale]=useState<"normal"|"large"|"xlarge">("normal");
  useEffect(()=>{const saved=localStorage.getItem("vibe-font-scale") as "normal"|"large"|"xlarge"|null;if(saved)setFontScale(saved)},[]);
  useEffect(()=>{const size={normal:"16px",large:"18px",xlarge:"20px"}[fontScale];document.documentElement.style.fontSize=size;localStorage.setItem("vibe-font-scale",fontScale);return()=>{document.documentElement.style.fontSize=""}},[fontScale]);
  const [repoUrl,setRepoUrl]=useState("");const [deployUrl,setDeployUrl]=useState("");const [purpose,setPurpose]=useState("");
  const [mode,setMode]=useState("quick");const [selected,setSelected]=useState(["보안 위험","오류 가능성","UI·UX 사용성","인수인계 용이성"]);
  const [entryMode,setEntryMode]=useState<"direct"|"finder">("direct");const [finderNotice,setFinderNotice]=useState("");
  const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [report,setReport]=useState<Report|null>(null);const [tab,setTab]=useState("종합판정");
  const visibleIssues=useMemo(()=>{if(!report)return[];const map:Record<string,string[]>={
    "오류 가능성":["오류"],"보안 점검":["보안"],"테스트 현황":["테스트"],"UI·UX 점검":["UI·UX","접근성","모바일"],"인수인계":["유지보수","인수인계"],"추가 확인":["추가 확인"]
  };return map[tab]?report.issues.filter(i=>map[tab].includes(i.area)):report.issues},[report,tab]);

  function toggle(item:string){setSelected(v=>v.includes(item)?v.filter(x=>x!==item):[...v,item])}
  async function analyze(){
    setError("");setLoading(true);setReport(null);setTab("종합판정");
    try{
      const res=await fetch("/api/analyze",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({repoUrl,deployUrl,purpose,mode,focus:selected})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"진단을 시작하지 못했습니다.");
      setReport(data);setTimeout(()=>document.getElementById("result-top")?.scrollIntoView({behavior:"smooth"}),80);
    }catch(e){setError(e instanceof Error?e.message:"공개 데이터를 조회하지 못했습니다.");}
    finally{setLoading(false)}
  }
  function reset(){setReport(null);setError("");setTab("종합판정");window.scrollTo({top:0,behavior:"smooth"})}
  function markdown(){
    if(!report)return"";return `# Vibe Code Review Lab 진단 보고서\n\n- 프로젝트: ${report.repo.name}\n- 종합결론: ${report.verdict}\n- 확인 범위: ${report.summary}\n\n## 지금 해야 할 일\n${report.nextActions.map((x,i)=>`${i+1}. ${x}`).join("\n")}\n\n## 상세 항목\n${report.issues.map(i=>`### ${i.title}\n- 우선순위: ${i.priority}\n- 검증 수준: ${i.level}\n- 위치: ${i.location}\n- 근거: ${i.evidence}\n- 권장 조치: ${i.recommendation}`).join("\n\n")}\n\n> 공개된 소스코드와 접근 가능한 배포 화면 기준 읽기 전용 분석입니다.`;
  }
  async function copy(text:string){await navigator.clipboard.writeText(text);alert("클립보드에 복사했습니다.")}
  function selectRepo(repo:RepoCandidate,topic:string,goal:string){
    const presets:Record<string,{mode:string;focus:string[]}>={
      structure:{mode:"code",focus:["코드 구조","인수인계 용이성"]},test:{mode:"code",focus:["테스트 누락","오류 가능성"]},
      security:{mode:"code",focus:["보안 위험","오류 가능성"]},ui:{mode:"ui",focus:["UI·UX 사용성"]},overall:{mode:"full",focus:focusItems}
    };
    const preset=presets[goal]||presets.overall;
    setRepoUrl(repo.htmlUrl);setDeployUrl(repo.homepage||"");setPurpose(`${topic} 관련 공개 프로젝트`);setMode(preset.mode);setSelected(preset.focus);
    setFinderNotice(`${repo.fullName}을(를) 선택했습니다. 아래 입력값과 진단 범위를 확인해 주세요.`);setEntryMode("direct");
    setTimeout(()=>document.getElementById("diagnosis-form")?.scrollIntoView({behavior:"smooth",block:"start"}),80);
  }

  return <div className={`app scale-${fontScale}`}>
    <AccessibilityBar scale={fontScale} setScale={setFontScale}/>
    <Header/>
    {!report&&!loading&&<main className={`mainShell ${entryMode==="finder"?"finderShell":""}`}>
      <section className="landingHero">
        <span className="preflight">ⓘ 배포 전 꼭 확인하세요</span>
        <h1>바이브코딩 프로젝트,<br/>배포 전에 한 번 더 점검하세요</h1>
        <p>GitHub 저장소와 배포 주소를 입력하면 소스코드 구조, 보안, 오류 가능성, UI·UX 상태를 비개발자의 눈높이에 맞춰 진단합니다.</p>
      </section>
      <section className="entryChooser" aria-label="진단 시작 방법">
        <button className={entryMode==="direct"?"active":""} onClick={()=>setEntryMode("direct")}><span>⌘</span><b>GitHub 주소 직접 입력</b><small>알고 있는 공개 저장소를 바로 진단합니다.</small></button>
        <button className={entryMode==="finder"?"active":""} onClick={()=>setEntryMode("finder")}><span>⌕</span><b>공개 Repo 찾아보기</b><small>주제를 넓게 검색한 뒤 적합한 후보를 고릅니다.</small></button>
      </section>
      {entryMode==="finder"&&<RepoWorkbench/>}
      {entryMode==="direct"&&<section className="inputCard" id="diagnosis-form">
        {finderNotice&&<div className="finderNotice">✓ {finderNotice}</div>}
        <label><b>1. GitHub Repository URL <em>* 필수</em></b><small>분석할 공개 저장소 주소를 입력하세요.</small><div className="bigInput"><span>⌘</span><input type="url" value={repoUrl} onChange={e=>setRepoUrl(e.target.value)} placeholder="https://github.com/사용자명/저장소명"/></div></label>
        <label><b>2. 배포 URL <i>선택 입력</i></b><small>Vercel, Netlify, GitHub Pages 등 실제로 접속 가능한 주소입니다.</small><div className="bigInput"><span>◎</span><input type="url" value={deployUrl} onChange={e=>setDeployUrl(e.target.value)} placeholder="https://my-app.vercel.app"/></div></label>
        <label><b>3. 프로젝트 목적 <i>선택 입력</i></b><small>이 프로젝트가 해결하려는 일을 짧게 적어주세요.</small><div className="bigInput"><input value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="예: 고객 상담관리, 교육자료실, 예약관리"/></div></label>
        <fieldset><legend>4. 진단 모드 <em>* 필수</em></legend><div className="modeCards">{modes.map(([v,t,d])=><label className="modeCard" key={v}><input type="radio" checked={mode===v} onChange={()=>setMode(v)}/><span/><div><b>{t}</b><small>{d}</small></div></label>)}</div></fieldset>
        <fieldset><legend>5. 중점 점검 항목 <i>복수 선택 가능</i></legend><div className="checkGrid">{focusItems.map(item=><label className="checkCard" key={item}><input type="checkbox" checked={selected.includes(item)} onChange={()=>toggle(item)}/><span>{item}</span></label>)}</div></fieldset>
        {!deployUrl&&<div className="optionalNote"><b>배포 URL을 입력하지 않으면</b><span>코드 진단은 진행되지만 UI·UX, 모바일, 접근성은 <strong>‘진단 제외’</strong>로 표시됩니다.</span></div>}
        {error&&<div className="errorBox">⚠ {error}</div>}
        <button className="startButton" disabled={!repoUrl} onClick={analyze}>⌕ 코드·UI 진단 시작하기</button>
      </section>}
    </main>}
    {loading&&<Progress hasDeploy={Boolean(deployUrl)}/>}
    {report&&<ResultDashboard report={report} tab={tab} setTab={setTab} visibleIssues={visibleIssues} deployProvided={Boolean(deployUrl)} reset={reset} copy={copy} markdown={markdown}/>}
    <Footer/>
  </div>
}

function RepoWorkbench(){
  const [business,setBusiness]=useState("infopreneur");const [topic,setTopic]=useState("landing page");const [topicLabel,setTopicLabel]=useState("랜딩페이지");
  const [language,setLanguage]=useState("");const [goal,setGoal]=useState("overall");const [minStars,setMinStars]=useState("10");
  const [searching,setSearching]=useState(false);const [error,setError]=useState("");const [items,setItems]=useState<RepoCandidate[]>([]);const [selectedRepo,setSelectedRepo]=useState<RepoCandidate|null>(null);
  const [statuses,setStatuses]=useState<Record<string,string>>({});const [analyzing,setAnalyzing]=useState(false);const [report,setReport]=useState<Report|null>(null);const [tab,setTab]=useState("종합판정");const [listOpen,setListOpen]=useState(false);
  const visibleIssues=useMemo(()=>{if(!report)return[];const map:Record<string,string[]>={"오류 가능성":["오류"],"보안 점검":["보안"],"테스트 현황":["테스트"],"UI·UX 점검":["UI·UX","접근성","모바일"],"인수인계":["유지보수","인수인계"],"추가 확인":["추가 확인"]};return map[tab]?report.issues.filter(i=>map[tab].includes(i.area)):report.issues},[report,tab]);
  const preset:Record<string,{mode:string;focus:string[]}>={
    structure:{mode:"code",focus:["코드 구조","인수인계 용이성"]},test:{mode:"code",focus:["테스트 누락","오류 가능성"]},security:{mode:"code",focus:["보안 위험","오류 가능성"]},ui:{mode:"ui",focus:["UI·UX 사용성"]},overall:{mode:"full",focus:focusItems}
  };
  const activeBusiness=businessTopics.find(x=>x.id===business)||businessTopics[0];
  const queryPreview=`${topic || "검색어"} in:name,description,readme stars:>=${minStars||0} archived:false fork:false${language?` language:${language}`:""}`;
  function chooseBusiness(id:string){const next=businessTopics.find(x=>x.id===id)||businessTopics[0];setBusiness(id);setTopic(next.topics[0][0]);setTopicLabel(next.topics[0][1])}
  function chooseTopic(value:string,label:string){setTopic(value);setTopicLabel(label)}
  function useReferenceKeyword(value:string,label:string){setTopic(value);setTopicLabel(label)}
  async function search(){
    setSearching(true);setError("");setItems([]);setSelectedRepo(null);setReport(null);setStatuses({});
    try{const res=await fetch("/api/search-repos",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({topic,language,purpose:goal,minStars:Number(minStars)})});const data=await res.json();if(!res.ok)throw new Error(data.error||"저장소를 검색하지 못했습니다.");setItems(data.items||[])}
    catch(e){setError(e instanceof Error?e.message:"저장소를 검색하지 못했습니다.")}finally{setSearching(false)}
  }
  function choose(repo:RepoCandidate){setSelectedRepo(repo);setReport(null);setTab("종합판정");setListOpen(false)}
  async function analyzeSelected(){
    if(!selectedRepo)return;setAnalyzing(true);setError("");setReport(null);setStatuses(v=>({...v,[selectedRepo.fullName]:"진단 중"}));
    const p=preset[goal]||preset.overall;
    try{const res=await fetch("/api/analyze",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({repoUrl:selectedRepo.htmlUrl,deployUrl:selectedRepo.homepage,purpose:`${topicLabel} 목적의 공개 프로젝트`,mode:p.mode,focus:p.focus})});const data=await res.json();if(!res.ok)throw new Error(data.error||"진단을 시작하지 못했습니다.");setReport(data);setStatuses(v=>({...v,[selectedRepo.fullName]:"진단 완료"}))}
    catch(e){setError(e instanceof Error?e.message:"공개 데이터를 조회하지 못했습니다.");setStatuses(v=>({...v,[selectedRepo.fullName]:"확인 불가"}))}finally{setAnalyzing(false)}
  }
  function md(){if(!report)return"";return `# ${report.repo.name} 진단 보고서\n\n## 종합결론\n${report.verdict}\n\n${report.summary}\n\n## 지금 해야 할 일\n${report.nextActions.map((x,i)=>`${i+1}. ${x}`).join("\n")}`}
  async function copy(text:string){await navigator.clipboard.writeText(text);alert("클립보드에 복사했습니다.")}
  return <section className="repoWorkbench">
    <section className="purposeFinder">
      <div className="purposeIntro"><div><small>유지비가 적은 목적형 프로젝트 찾기</small><h2>어떤 일에 활용할 프로젝트인가요?</h2><p>대규모 시스템보다 콘텐츠 자산화와 고객 접점 자동화에 바로 활용할 수 있는 경량 프로젝트를 찾습니다.</p></div><span>적합도 높은 순</span></div>
      <div className="businessChoices">{businessTopics.map(x=><button className={business===x.id?"active":""} key={x.id} onClick={()=>chooseBusiness(x.id)}><b>{x.label}</b><small>{x.description}</small></button>)}</div>
      <div className="topicChooser"><b>{activeBusiness.label}의 추천 검색어</b><div>{activeBusiness.topics.map(([value,label])=><button className={topic===value?"active":""} key={value} onClick={()=>chooseTopic(value,label)}>{label}<code>{value}</code></button>)}</div></div>
      <label className="keywordInput"><b>검색 키워드</b><small>추천어를 그대로 쓰거나 원하는 말로 바꿔 검색하세요. 여러 조건을 강제로 묶지 않습니다.</small><input value={topic} onChange={e=>{setTopic(e.target.value);setTopicLabel(e.target.value)}} placeholder="예: landing page, newsletter, booking system"/></label>
      <div className="referenceKeywords"><div><b>경량화 참고 키워드</b><small>검색 조건이 아니라 참고용입니다. 하나를 누르면 검색어로 바뀝니다.</small></div>{lightOptions.map(([value,label])=><button key={value} onClick={()=>useReferenceKeyword(value,label)}><span>{label}</span><code>{value}</code></button>)}</div>
      <div className="searchOptions"><label><b>주요 기술</b><select value={language} onChange={e=>setLanguage(e.target.value)}><option value="">전체</option><option>TypeScript</option><option>JavaScript</option><option>Python</option><option>Java</option><option>Go</option></select></label><label><b>추천 목적</b><select value={goal} onChange={e=>setGoal(e.target.value)}><option value="overall">종합 진단</option><option value="structure">구조 참고</option><option value="test">테스트 학습</option><option value="security">보안 점검</option><option value="ui">UI·UX 참고</option></select></label><label><b>최소 Star</b><input type="number" min="0" value={minStars} onChange={e=>setMinStars(e.target.value)}/></label></div>
      <div className="queryPreview"><span>실제 검색 방식</span><code>{queryPreview}</code><small>Topic 등록 여부에 의존하지 않고 저장소 이름·설명·README에서 넓게 찾습니다. 추천 판단은 검색 결과를 받은 뒤 수행합니다.</small></div>
      <button className="finderSearch" onClick={search} disabled={!topic.trim()||searching}>{searching?"GitHub에서 찾는 중…":"⌕ 이 키워드로 Repo 검색"}</button>
    </section>
    {error&&<div className="errorBox">⚠ {error}</div>}
    <button className="mobileListButton" onClick={()=>setListOpen(v=>!v)}>☰ 검색 결과 {items.length}개 {listOpen?"닫기":"열기"}</button>
    <div className="workColumns">
      <aside className={`repoSidebar ${listOpen?"open":""}`}>
        <div className="sidebarHead"><b>검색 결과</b><span>{items.length}개</span></div>
        {!items.length&&<p className="sideEmpty">주제를 검색하면 공개 Repo 후보가 여기에 표시됩니다.</p>}
        {items.map(repo=><button className={`sideRepo ${selectedRepo?.fullName===repo.fullName?"selected":""}`} key={repo.fullName} onClick={()=>choose(repo)}>
          <div><b>{repo.fullName}</b><span className={`repoState state-${statuses[repo.fullName]||"미진단"}`}>{statuses[repo.fullName]||"미진단"}</span></div>
          <p>{repo.description}</p><small>{repo.language} · ★ {repo.stars.toLocaleString()} · {repo.suitabilityLabel}</small>
        </button>)}
      </aside>
      <div className="workDetail">
        {!selectedRepo&&<div className="selectGuide"><span>←</span><h2>진단할 Repo를 선택하세요</h2><p>왼쪽 검색 결과는 그대로 유지됩니다. 한 번에 하나씩 선택해 독립적으로 진단할 수 있습니다.</p></div>}
        {selectedRepo&&!report&&!analyzing&&<section className="selectedSummary"><span className="selectionLabel">선택한 Repo</span><h2>{selectedRepo.fullName}</h2><p>{selectedRepo.description}</p><div className="selectedFacts"><span>{selectedRepo.language}</span><span>★ {selectedRepo.stars.toLocaleString()}</span><span>{selectedRepo.license}</span><span>{selectedRepo.homepage?"배포 화면 있음":"배포 화면 없음"}</span></div><div className="selectionReasons"><h3>추천 판단 근거</h3>{selectedRepo.reasons.map(x=><p key={x}>✓ {x}</p>)}</div>{!selectedRepo.homepage&&<div className="optionalNote"><b>UI·UX 진단 제외</b><span>배포 URL이 없어 코드만 진단합니다.</span></div>}<button className="startButton" onClick={analyzeSelected}>이 Repo 독립 진단 시작</button></section>}
        {analyzing&&<Progress hasDeploy={Boolean(selectedRepo?.homepage)}/>}
        {report&&<ResultDashboard report={report} tab={tab} setTab={setTab} visibleIssues={visibleIssues} deployProvided={Boolean(selectedRepo?.homepage)} reset={()=>setReport(null)} copy={copy} markdown={md}/>}
      </div>
    </div>
  </section>
}

function AccessibilityBar({scale,setScale}:{scale:string;setScale:(v:"normal"|"large"|"xlarge")=>void}){
  return <aside className="accessBar" aria-label="화면 설정"><div><span className="demoBadge">가독성 강화</span><p>큰 글자와 높은 대비를 적용한 비개발자용 화면</p></div><div className="fontControls"><span>글자 크기</span>{[["normal","기본"],["large","크게"],["xlarge","매우 크게"]].map(([v,t])=><button key={v} className={scale===v?"active":""} onClick={()=>setScale(v as "normal"|"large"|"xlarge")}>{t}</button>)}</div></aside>
}
function Header(){return <header className="siteHeader"><div className="headerInner"><div className="logo"><span>⌕</span><div><b>Vibe Code Review Lab</b><small>비개발자를 위한 바이브코딩 안전 진단 보고서</small></div></div><div className="safeBadge">◆ 100% 읽기 전용 진단 <span>(코드 수정 없음)</span></div></div></header>}
function Progress({hasDeploy}:{hasDeploy:boolean}){const steps=["Repository 접근 및 README 확인","폴더 구조 및 주요 파일 스캔","보안 키·오류·테스트 상태 점검",hasDeploy?"배포 화면 UI·UX 확인":"UI·UX 진단 제외 — 배포 URL 미입력","종합결론과 다음 행동 작성"];return <main className="progressShell"><section className="progressCard"><div className="spinner">◌</div><h1>프로젝트 분석을 진행하고 있습니다</h1><p>잠시만 기다려 주세요. 공개된 정보를 읽기 전용으로 안전하게 확인하고 있습니다.</p><div className="stepList">{steps.map((s,i)=><div className={i<2?"done":i===2?"doing":i===3&&!hasDeploy?"skipped":"waiting"} key={s}><i>{i<2?"✓":i===2?"◌":i===3&&!hasDeploy?"—":"○"}</i><span>{i+1}. {s}</span></div>)}</div></section></main>}
function ResultDashboard({report,tab,setTab,visibleIssues,deployProvided,reset,copy,markdown}:{report:Report;tab:string;setTab:(v:string)=>void;visibleIssues:Issue[];deployProvided:boolean;reset:()=>void;copy:(v:string)=>void;markdown:()=>string}){
  return <main className="resultShell" id="result-top">
    <div className="limitNotice"><span>⚠</span><div><b>분석 범위 한계 안내</b><p>본 결과는 공개된 소스코드와 접근 가능한 배포 화면을 기반으로 한 읽기 전용 분석입니다. 실제 빌드·테스트·운영 DB 환경 검증 결과와 다를 수 있습니다.</p></div></div>
    <section className="reportHeader"><div className="reportIdentity"><span className="completeBadge">분석 완료</span><h1>{report.repo.name}</h1><div className="bilingualDescription"><p><b>GitHub 설명</b>{report.repo.description||"Repository 설명이 제공되지 않았습니다."}</p><p><b>README 요약</b>{report.repo.descriptionKo}<small>{report.repo.readmePath||"README 미확인"}</small></p></div><div className="reportMeta"><span>기본 브랜치: {report.repo.defaultBranch}</span>{report.repo.deployUrl?<a href={report.repo.deployUrl} target="_blank" rel="noreferrer">◎ 배포 URL 열기 ↗</a>:<span className="noDeploy">— 배포 URL 미확인 · UI 진단 제외</span>}</div></div><div className="reportActions"><button onClick={()=>copy(markdown())}>▣ 보고서 복사</button><button onClick={()=>window.print()}>▤ 인쇄 / PDF</button><button className="blue" onClick={reset}>↻ 진단 설정으로 돌아가기</button></div></section>
    <nav className="resultTabs" aria-label="진단 결과 항목">{tabs.map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t}{t==="UI·UX 점검"&&!deployProvided?" · 제외":""}</button>)}</nav>
    {tab==="종합판정"&&<Overview report={report}/>}
    {tab==="프로젝트 구조"&&<section className="tabPanel scopeGrid"><Scope title="실제 확인한 파일" items={report.filesRead}/><Scope title="구조만 확인한 폴더" items={report.foldersSeen}/><Scope title="분석하지 못한 범위" items={report.notAnalyzed}/><Scope title="제외한 파일 유형" items={report.excluded}/></section>}
    {tab==="테스트 현황"&&<section className="tabPanel"><StatusCard label="실행 결과 미확인" title={report.tests.status} text={report.tests.method}/><Scope title="확인한 테스트 관련 파일" items={report.tests.files}/><IssueList issues={visibleIssues}/></section>}
    {tab==="UI·UX 점검"&&<section className="tabPanel">{!deployProvided?<SkippedUi/>:<><StatusCard label={report.ui.status} title="배포 화면 확인 결과" text={report.ui.note}/>{report.ui.evidence.length>0&&<div className="evidenceList">{report.ui.evidence.map(x=><p key={x}>✓ {x}</p>)}</div>}<IssueList issues={visibleIssues}/></>}</section>}
    {!["종합판정","프로젝트 구조","테스트 현황","UI·UX 점검"].includes(tab)&&<section className="tabPanel">{visibleIssues.length?<IssueList issues={visibleIssues}/>:<Empty/>}</section>}
    <div className="bottomActions"><button onClick={()=>copy(document.body.innerText)}>전체 화면 내용 복사</button><button onClick={()=>copy(markdown())}>Markdown 복사</button><button onClick={()=>window.print()}>인쇄·PDF 저장</button></div>
  </main>
}
const signalText={danger:{mark:"!",label:"먼저 수정이 필요합니다"},caution:{mark:"△",label:"보완 후 진행할 수 있습니다"},good:{mark:"✓",label:"뚜렷한 위험 신호는 없습니다"}};
function Overview({report}:{report:Report}){
  const urgent=report.issues.filter(i=>i.priority==="긴급").length;
  const high=report.issues.filter(i=>i.priority==="높음").length;
  const needCheck=report.issues.filter(i=>i.level==="확인 필요").length;
  const level:"danger"|"caution"|"good"=urgent?"danger":high?"caution":"good";
  const signal=signalText[level];
  return <div className="overview">
  <section className={`overallCard ${level}`}>
    <div className="overallHead">
      <div className="overallLead"><span className="signalDot" aria-hidden="true">{signal.mark}</span><div><small>{signal.label}</small><h2>{report.verdict}</h2></div></div>
      <div className="verdictStats" aria-label="발견 항목 요약">
        <span className="stat danger"><b>{urgent}</b>긴급</span><span className="stat caution"><b>{high}</b>높음</span>
        <span className="stat unknown"><b>{needCheck}</b>확인 필요</span><span className="stat"><b>{report.filesRead.length}</b>확인 파일</span>
      </div>
    </div>
    <p>{report.summary}</p>
  </section>
  <section className="actionSection"><div><small>다음 확인 순서</small><h2>지금 해야 할 일</h2><p>우선순위가 높은 실행 점검만 골랐습니다.</p></div><ol>{report.nextActions.map((x,i)=><li key={x}><i>{i+1}</i><span>{x}</span></li>)}</ol></section>
  <section className="decisionSection"><div className="sectionIntro"><h2>분야별 판단</h2><p>위험·주의 항목은 펼쳐져 있습니다. 나머지는 눌러서 근거와 다음 행동을 확인하세요.</p></div><div className="decisionList">{report.decisions.map(d=><details className={`decisionCard ${d.tone}`} key={d.area} open={d.tone==="danger"||d.tone==="caution"}>
    <summary><div><small>{d.area}</small><b>{d.verdict}</b></div><span className="chev">⌄</span></summary>
    <div className="decisionBody"><p>{d.reason}</p>{d.evidence.length>0&&<div className="evidence"><b>확인 근거</b>{d.evidence.map((x,i)=><span key={`${x}-${i}`}>• {x}</span>)}</div>}<div className="next"><b>다음 행동</b><p>{d.next}</p></div></div>
  </details>)}</div></section>
  <section className="judgmentSection"><h2>현재 단계에서 가능한 판단</h2><div>{report.currentJudgments.map(j=><article className={j.tone} key={j.label}><small>{j.label}</small><b>{j.value}</b></article>)}</div></section>
  <section className="scopeMeaning"><h2>확인 범위의 의미</h2><p>• 주요 파일 <b>{report.filesRead.length}개</b>를 실제로 읽어 프로젝트 구조를 확인했습니다.</p><p>• 테스트 관련 파일 <b>{report.tests.files.length}개</b>를 발견했지만 실제 실행하지 않았습니다.</p><p>• 운영 환경변수, 데이터베이스 권한, 실제 빌드와 배포 로그는 확인하지 못했습니다.</p></section>
</div>}
function SkippedUi(){return <div className="skippedUi"><div className="skipIcon">—</div><span>진단 제외</span><h2>배포 URL이 입력되지 않았습니다</h2><p>코드 진단은 정상적으로 완료됐지만 실제 화면을 열어보지 않았으므로 UI·UX, 모바일, 접근성은 평가하지 않았습니다.</p><div><b>UI 진단을 받으려면</b><p>‘새 저장소 분석’을 눌러 실제 접속 가능한 배포 URL을 함께 입력하세요.</p></div></div>}
function StatusCard({label,title,text}:{label:string;title:string;text:string}){return <div className="statusCard"><span className="statusLabel">{label}</span><h2>{title}</h2><p>{text}</p></div>}
function Scope({title,items}:{title:string;items:string[]}){return <article className="scopeCard"><h3>{title}</h3>{items.length?items.map(x=><code key={x}>{x}</code>):<p>해당 항목이 없습니다.</p>}</article>}
function IssueList({issues}:{issues:Issue[]}){return <div className="issueList">{issues.map((i,n)=><details className={`issue priority-${i.priority}`} key={i.title+n} open={n<3}><summary><div><span className="priority">{i.priority}</span><span className={`verify ${i.level==="확인됨"?"confirmed":i.level==="추정됨"?"inferred":"needed"}`}>{i.level}</span><small>분야: {i.area}</small><b>{i.title}</b></div><span>⌄</span></summary><div className="issueBody"><dl><dt>위치</dt><dd><code>{i.location}</code></dd><dt>근거</dt><dd>{i.evidence}</dd><dt>현재 상태</dt><dd>{i.status}</dd><dt>영향</dt><dd>{i.impact}</dd><dt>권장 조치</dt><dd>{i.recommendation}</dd></dl></div></details>)}</div>}
function Empty(){return <div className="empty"><b>확인한 범위에서는 해당 위험 신호를 발견하지 못했습니다.</b><p>‘문제 없음’이나 ‘안전함’을 의미하지는 않습니다. 실행 환경과 미확인 파일은 별도 검증이 필요합니다.</p></div>}
function Footer(){return <footer className="footer"><p>Vibe Code Review Lab © 2026 · 비개발자를 위한 읽기 전용 진단 도구</p><small>소스코드 수정, 패키지 설치, 데이터베이스 접속을 실행하지 않습니다.</small></footer>}
