type TreeItem={path:string;type:"blob"|"tree";size?:number};
type Issue={title:string;priority:string;level:string;area:string;location:string;evidence:string;status:string;impact:string;recommendation:string};
type Decision={area:string;verdict:string;tone:"good"|"caution"|"unknown"|"danger";reason:string;evidence:string[];next:string};

const textExt=/\.(md|txt|json|js|jsx|ts|tsx|py|toml|yaml|yml|css|html|sql|prisma)$/i;
const priorityNames=["README.md","package.json","requirements.txt","pyproject.toml",".gitignore",".env.example","vercel.json","netlify.toml"];
const keyPath=/(^|\/)(src|app|pages|api|server|lib|utils|supabase|prisma|test|tests|__tests__|\.github\/workflows)(\/|$)/;

export async function POST(request:Request){
  try{
    const {repoUrl,deployUrl,mode,purpose}=await request.json();
    const match=String(repoUrl||"").match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i);
    if(!match)return Response.json({error:"GitHub Repository 주소 형식을 확인해 주세요."},{status:400});
    const owner=match[1],repo=match[2];
    const headers={"Accept":"application/vnd.github+json","User-Agent":"Vibe-Code-Review-Lab"};
    const metaRes=await fetch(`https://api.github.com/repos/${owner}/${repo}`,{headers});
    if(!metaRes.ok){
      const remaining=metaRes.headers.get("x-ratelimit-remaining");const reset=metaRes.headers.get("x-ratelimit-reset");
      if((metaRes.status===403||metaRes.status===429)&&remaining==="0"){const time=reset?new Date(Number(reset)*1000).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}):"잠시 후";return Response.json({error:`GitHub 공개 조회 한도에 도달했습니다. ${time} 이후 다시 시도해 주세요.`},{status:429})}
      const reasons:Record<number,string>={403:"이 Repository는 공개 조회 권한으로 접근할 수 없습니다.",404:"Repository가 없거나 비공개입니다."};
      return Response.json({error:reasons[metaRes.status]||"Repository 접근에 실패했습니다."},{status:metaRes.status===404?404:502});
    }
    const meta=await metaRes.json();
    const treeRes=await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`,{headers});
    if(!treeRes.ok){const reset=treeRes.headers.get("x-ratelimit-reset");if(treeRes.status===403)return Response.json({error:`GitHub 파일 구조 조회 한도에 도달했습니다.${reset?` ${new Date(Number(reset)*1000).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})} 이후 다시 시도해 주세요.`:""}`},{status:429});return Response.json({error:"파일 구조 조회에 실패했습니다."},{status:502})}
    const treeData=await treeRes.json(); const tree:TreeItem[]=treeData.tree||[];
    const blobs=tree.filter(x=>x.type==="blob"); const folders=tree.filter(x=>x.type==="tree").map(x=>x.path);
    const candidates=blobs.filter(x=>textExt.test(x.path)&&((x.size||0)<160000)&&(priorityNames.includes(x.path)||keyPath.test(x.path)))
      .sort((a,b)=>score(b.path)-score(a.path)).slice(0,mode==="quick"?10:22);
    const readFiles:{path:string;content:string}[]=[];
    for(const file of candidates){
      const rawPath=file.path.split("/").map(encodeURIComponent).join("/");
      const r=await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(meta.default_branch)}/${rawPath}`,{headers:{"User-Agent":"Vibe-Code-Review-Lab"}});
      if(r.ok)readFiles.push({path:file.path,content:await r.text()});
    }
    const issues=analyzeFiles(readFiles,blobs);
    const testFiles=blobs.filter(x=>/(^|\/)(__tests__|tests?|spec)(\/|\.|$)|\.(test|spec)\.[jt]sx?$/i.test(x.path)).map(x=>x.path).slice(0,30);
    if(!testFiles.length)issues.push(issue("테스트 파일을 확인하지 못했습니다","높음","확인됨","테스트","Repository 파일 구조","테스트·spec 명명 규칙에 해당하는 파일이 보이지 않습니다.","자동 테스트 파일 미확인","변경 시 기존 기능의 오류를 발견하기 어렵습니다.","핵심 사용자 흐름부터 단위 또는 브라우저 테스트를 추가하세요."));
    const readme=readFiles.find(x=>/^readme\.md$/i.test(x.path));
    if(!readme||!/(npm test|pytest|vitest|jest|playwright|cypress)/i.test(readme.content))issues.push(issue("README에서 테스트 방법을 확인하기 어렵습니다","중간","확인됨","테스트",readme?.path||"README.md","확인한 README에 구체적인 테스트 실행 명령이 없거나 README를 읽지 못했습니다.","테스트 재현 절차 미확인","인수인계 시 품질 확인 방법이 불분명해집니다.","사용 도구, 실행 명령, 필요한 준비 조건을 README에 기록하세요."));
    const ui=await inspectUi(deployUrl);
    if(deployUrl&&ui.status.includes("미확인"))issues.push(issue("배포 화면을 확인하지 못했습니다","중간","확인 필요","UI·UX",String(deployUrl),ui.note,"UI 화면 미확인","실제 화면의 모바일·접근성·동작을 평가할 수 없습니다.","주소와 공개 접근 여부를 확인한 뒤 브라우저에서 직접 점검하세요."));
    if(ui.status==="일부 확인"&&!ui.evidence.some(x=>x.includes("viewport")))issues.push(issue("모바일 화면 설정을 확인하지 못했습니다","중간","추정됨","모바일",String(deployUrl), "HTML 응답에서 viewport 설정을 찾지 못했습니다.","모바일 대응 여부 추정 필요","작은 화면에서 비율이나 폭이 어긋날 수 있습니다.","viewport 메타 태그와 실제 모바일 화면을 확인하세요."));
    issues.sort((a,b)=>["긴급","높음","중간","낮음"].indexOf(a.priority)-["긴급","높음","중간","낮음"].indexOf(b.priority));
    const serious=issues.filter(x=>x.priority==="긴급"||x.priority==="높음");
    const verdict=issues.some(x=>x.priority==="긴급")?"주요 위험을 먼저 수정해야 합니다":issues.some(x=>x.priority==="높음")?"구조는 확인됐지만 중요한 보완이 필요합니다":"구조는 갖춰져 있으나 실제 실행 검증 전입니다";
    const stack=detectStack(readFiles,blobs);
    const hasReadme=blobs.some(x=>/^README\.md$/i.test(x.path));
    const hasBuildConfig=blobs.some(x=>/(package\.json|pyproject\.toml|requirements\.txt|vite\.config|next\.config)/i.test(x.path));
    const hasDeployConfig=blobs.some(x=>/(vercel\.json|netlify\.toml|Dockerfile|\.github\/workflows)/i.test(x.path));
    const hasSecuritySignal=issues.some(x=>x.area==="보안"&&(x.priority==="긴급"||x.priority==="높음"));
    const decisions:Decision[]=[
      {area:"코드 구조",verdict:readFiles.length>=5?"비교적 잘 갖춰짐":"일부만 확인됨",tone:readFiles.length>=5?"good":"caution",reason:readFiles.length>=5?"주요 설정 파일과 핵심 폴더를 확인했습니다.":"읽은 파일 범위가 작아 전체 구조 판단이 제한됩니다.",evidence:[stack.length?`${stack.join(" · ")} 관련 파일 확인`:"기술 스택 자동 식별 제한",`${readFiles.length}개 주요 파일 내용 확인`,hasBuildConfig?"빌드 관련 설정 파일 존재":"빌드 설정 파일 미확인"],next:"큰 파일과 기능별 분리 상태를 세부 탭에서 확인하세요."},
      {area:"오류 위험",verdict:serious.some(x=>x.area==="오류")?"주요 위험 발견":issues.some(x=>x.area==="오류")?"확인 필요":"낮아 보임",tone:serious.some(x=>x.area==="오류")?"danger":issues.some(x=>x.area==="오류")?"caution":"good",reason:issues.some(x=>x.area==="오류")?"정적 코드에서 오류 처리 관련 점검 항목을 발견했습니다.":"확인한 코드에서는 뚜렷한 오류 위험 신호를 찾지 못했습니다.",evidence:issues.filter(x=>x.area==="오류").slice(0,2).map(x=>x.title).concat(["실제 실행 오류는 미확인"]).slice(0,3),next:"핵심 사용자 흐름을 실행해 오류 메시지와 예외 처리를 확인하세요."},
      {area:"테스트 준비",verdict:testFiles.length?"테스트 체계 있음 · 결과 미확인":"테스트 파일 미확인",tone:testFiles.length?"good":"caution",reason:testFiles.length?`테스트 관련 파일 ${testFiles.length}개가 있으나 실행하지 않았습니다.`:"저장소 구조에서 테스트 관련 파일을 찾지 못했습니다.",evidence:testFiles.slice(0,3).map(x=>x),next:testFiles.length?"저장소 안내에 맞춰 단위·통합·브라우저 테스트를 실행하세요.":"핵심 기능부터 자동 테스트를 추가하세요."},
      {area:"보안 상태",verdict:hasSecuritySignal?"위험 신호 발견":"뚜렷한 신호 없음 · 운영 판단 불가",tone:hasSecuritySignal?"danger":"unknown",reason:hasSecuritySignal?"확인한 코드에서 우선 검토할 보안 신호를 발견했습니다.":"공개 코드 범위에서는 뚜렷한 신호가 없지만 운영 권한과 비밀값은 볼 수 없습니다.",evidence:hasSecuritySignal?issues.filter(x=>x.area==="보안").slice(0,3).map(x=>x.title):["공개 코드 일부만 정적 확인","운영 환경변수·DB 권한 미확인"],next:"환경변수, 관리자 권한, 데이터베이스 정책을 운영 환경에서 점검하세요."},
      {area:"UI 상태",verdict:ui.status==="일부 확인"?"일부 확인 · 실사용 점검 필요":"화면 미확인",tone:ui.status==="일부 확인"?"caution":"unknown",reason:ui.note,evidence:ui.evidence.length?ui.evidence:["배포 화면을 직접 읽지 못함"],next:"데스크톱·모바일에서 주요 버튼과 입력 흐름을 직접 확인하세요."},
      {area:"배포 준비",verdict:"추가 점검 필요",tone:"unknown",reason:"설정 파일 존재와 실제 배포 성공은 다릅니다. 이 서비스는 빌드와 배포 로그를 실행·조회하지 않습니다.",evidence:[hasDeployConfig?"배포·자동화 관련 설정 파일 존재":"별도 배포 설정 파일 미확인","프로덕션 빌드 미실행","운영 로그 미확인"],next:"프로덕션 빌드와 배포 환경 로그를 확인한 뒤 결정하세요."},
      {area:"인수인계",verdict:hasReadme&&hasBuildConfig?"문서 확인 후 가능":"문서 보완 필요",tone:hasReadme&&hasBuildConfig?"caution":"unknown",reason:hasReadme?"README와 설정 파일은 있으나 실제 재현 가능 여부는 확인하지 않았습니다.":"프로젝트를 설명하는 기본 문서를 확인하기 어렵습니다.",evidence:[hasReadme?"README 존재":"README 미확인",hasBuildConfig?"실행 관련 설정 존재":"실행 설정 미확인",testFiles.length?"테스트 파일 존재":"테스트 파일 미확인"],next:"설치·환경변수·테스트·배포 절차를 새 담당자가 따라 할 수 있는지 확인하세요."}
    ];
    const nextActions=[
      hasBuildConfig?"프로덕션 빌드를 실행해 배포 가능한지 확인":"설치·빌드 방법을 문서에서 먼저 확인",
      testFiles.length?"기존 자동 테스트를 실행하고 실패 항목 확인":"핵심 기능의 테스트 시나리오 작성",
      "운영 환경변수와 관리자·데이터베이스 권한 점검",
      ...(ui.status==="일부 확인"?["모바일과 주요 사용자 흐름을 브라우저에서 직접 확인"]:[]),
      ...(serious.length?["긴급·높음 항목을 수정한 뒤 다시 검증"]:[])
    ].slice(0,5);
    const currentJudgments=[
      {label:"구조 참고·학습",value:readFiles.length>=5?"가능":"일부 가능",tone:readFiles.length>=5?"good":"caution"},
      {label:"개발 착수·템플릿 활용",value:serious.length?"보완 후 결정":"가능",tone:serious.length?"caution":"good"},
      {label:"운영 배포",value:"실행 점검 후 결정",tone:"unknown"}
    ];
    const limited=mode==="quick"?issues.slice(0,5):issues;
    return Response.json({
      repo:{
        name:`${owner}/${repo}`,description:meta.description||"",descriptionKo:readmeSummary(readme?.content,purpose,meta.language),
        readmePath:readme?.path||"",language:meta.language||"미확인",stars:meta.stargazers_count||0,defaultBranch:meta.default_branch,deployUrl:String(deployUrl||"")
      },
      summary:`${readFiles.length}개 주요 파일을 읽어 프로젝트 구조를 확인했습니다. ${testFiles.length?`테스트 관련 파일 ${testFiles.length}개를 발견했지만 실제 실행하지는 않았습니다.`:"테스트 파일은 확인하지 못했습니다."} 운영 환경과 데이터베이스 권한은 확인하지 못했습니다.`,
      verdict,filesRead:readFiles.map(x=>x.path),foldersSeen:folders.filter(x=>keyPath.test(x)).slice(0,30),
      excluded:["이미지·영상·폰트 등 바이너리 파일","160KB를 넘는 큰 파일","vendor·node_modules·빌드 산출물"],
      notAnalyzed:[treeData.truncated?"GitHub API가 생략한 일부 파일":"선별되지 않은 일반 소스 파일",`${Math.max(0,blobs.length-readFiles.length)}개 파일은 내용 미분석`],
      issues:limited,tests:{files:testFiles,method:"파일 존재 여부와 README의 실행 안내만 확인했습니다. 패키지 설치와 테스트 실행은 하지 않았습니다.",status:testFiles.length?"테스트 파일 존재 — 실행 결과 미확인":"테스트 파일 미확인"},
      ui,decisions,nextActions,currentJudgments,
      confirmed:[`${readFiles.length}개 주요 파일의 실제 내용`,testFiles.length?`테스트 관련 파일 ${testFiles.length}개`:"테스트 파일 미확인",stack.length?`${stack.join(" · ")} 프로젝트 구성`:"Repository 기본 구조"],
      unconfirmed:["프로덕션 빌드 성공 여부","자동 테스트 통과 여부","운영 환경변수·권한·데이터베이스 정책"]
    });
  }catch{ return Response.json({error:"공개 데이터를 조회하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."},{status:500});}
}

function score(path:string){let n=priorityNames.includes(path)?100:0;if(/package\.json|pyproject|requirements/i.test(path))n+=80;if(/auth|login|api|server|supabase|prisma|middleware/i.test(path))n+=60;if(/\.(test|spec)\./i.test(path))n+=45;if(/page|app|index|main/i.test(path))n+=30;return n}
function readmeSummary(readme:unknown,purpose:unknown,language:unknown){
  const text=String(readme||"");if(!text)return"README를 실제로 읽지 못해 한글 요약을 생성하지 않았습니다.";
  const clean=text.replace(/```[\s\S]*?```/g," ").replace(/!\[[^\]]*\]\([^)]*\)/g," ").replace(/<[^>]+>/g," ").replace(/\[[^\]]+\]\([^)]*\)/g," ").replace(/[#>*_`|~-]/g," ").replace(/\s+/g," ").trim();
  const stack=String(language||"").trim();const goal=String(purpose||"공개 프로젝트").replace(/입니다\.?$/,"").trim();
  const featureMap:[RegExp,string][]=[[/newsletter|email subscription/i,"뉴스레터·이메일 구독"],[/landing page|marketing page/i,"랜딩페이지"],[/course|learning|lms/i,"강의·학습 관리"],[/booking|appointment|calendar/i,"예약·일정 관리"],[/quiz|survey|form/i,"퀴즈·설문"],[/crm|customer relationship/i,"고객관계 관리"],[/kanban|project management|task/i,"프로젝트·업무 관리"],[/dashboard|admin panel|analytics/i,"대시보드·관리 화면"],[/markdown/i,"Markdown 콘텐츠 관리"],[/notion/i,"Notion 연동"],[/google sheets?/i,"Google Sheets 연동"]];
  const features=featureMap.filter(([pattern])=>pattern.test(clean)).map(([,label])=>label).slice(0,4);
  const title=text.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`]/g,"").trim();
  return `README 기준, ${title?`‘${title}’은(는) `:"이 저장소는 "}${goal}입니다.${stack?` 주요 개발 언어는 ${stack}입니다.`:""}${features.length?` README에서 ${features.join(", ")} 관련 내용을 확인했습니다.`:" README에서 구체적인 주요 기능을 자동 식별하지 못했습니다."}`;
}
function issue(title:string,priority:string,level:string,area:string,location:string,evidence:string,status:string,impact:string,recommendation:string):Issue{return{title,priority,level,area,location,evidence,status,impact,recommendation}}
function analyzeFiles(files:{path:string;content:string}[],blobs:TreeItem[]){
  const out:Issue[]=[]; const joined=files.map(x=>x.content).join("\n");
  for(const envFile of blobs.filter(x=>isSensitiveEnvPath(x.path))){
    out.push(issue("환경변수 파일이 Repository에 포함되어 있습니다","긴급","확인됨","보안",envFile.path,"Repository 전체 파일 목록에서 환경변수 파일 경로를 직접 확인했습니다.","민감정보 포함 가능","API 키나 비밀번호가 노출될 수 있습니다.","즉시 파일 내용을 확인하고 비밀값 폐기·재발급 후 Git 이력에서도 제거하세요."));
  }
  for(const f of files){
    const secret=f.content.match(/(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i);
    if(secret)out.push(issue("코드에 비밀값으로 보이는 문자열이 있습니다","긴급","추정됨","보안",f.path,`${secret[0].slice(0,28)}… 형태의 값을 확인했습니다. 실제 유효한 키인지는 확인하지 않았습니다.`,"하드코딩 의심","유효한 값이면 외부에 노출되어 악용될 수 있습니다.","비밀 저장소나 환경변수로 옮기고 해당 키의 유효성을 확인하세요."));
    if(f.content.length>45000)out.push(issue("한 파일에 많은 코드가 모여 있습니다","중간","확인됨","유지보수",f.path,`읽은 파일 크기가 약 ${Math.round(f.content.length/1000)}KB입니다.`,"대형 파일","기능 위치를 찾고 수정 영향 범위를 판단하기 어려울 수 있습니다.","화면·데이터·도우미 기능 단위로 분리할 수 있는지 검토하세요."));
    if(/fetch\s*\(/.test(f.content)&&!/(catch\s*\(|try\s*\{)/.test(f.content))out.push(issue("네트워크 실패 처리 여부를 확인해야 합니다","높음","추정됨","오류",f.path,"fetch 호출은 있으나 같은 파일에서 try/catch 또는 catch 처리를 찾지 못했습니다.","실패 처리 미확인","통신 오류 시 빈 화면이나 이해하기 어려운 오류가 나타날 수 있습니다.","로딩·성공·실패 상태와 사용자용 안내 문구를 명시하세요."));
    if(/dangerouslySetInnerHTML/.test(f.content))out.push(issue("HTML 직접 삽입 사용을 확인했습니다","높음","확인됨","보안",f.path,"dangerouslySetInnerHTML 사용 문자열을 직접 확인했습니다.","입력 출처와 정제 여부 미확인","외부 입력이 섞이면 스크립트 삽입 위험이 생길 수 있습니다.","입력 출처를 확인하고 신뢰할 수 있는 정제 라이브러리를 적용하세요."));
  }
  const pkg=files.find(x=>x.path==="package.json");
  if(pkg&&!/"scripts"\s*:\s*\{[^}]*"test"/s.test(pkg.content))out.push(issue("package.json에 test 명령이 없습니다","중간","확인됨","테스트","package.json","scripts 영역에서 test 명령을 찾지 못했습니다.","표준 테스트 명령 미확인","새 담당자가 테스트 방법을 바로 알기 어렵습니다.","프로젝트의 대표 테스트 명령을 scripts.test에 연결하세요."));
  if(!blobs.some(x=>x.path===".env.example")&&/(process\.env|import\.meta\.env|os\.environ)/.test(joined))out.push(issue("환경변수 예시 문서를 확인하지 못했습니다","중간","추정됨","인수인계","Repository 루트 및 읽은 설정 파일","코드는 환경변수를 참조하지만 .env.example 파일은 구조에서 보이지 않습니다.","필요한 환경변수 목록 미확인","다른 담당자가 실행 환경을 재구성하기 어렵습니다.",".env.example에는 값 없이 변수명과 용도만 기록하세요."));
  if(!blobs.some(x=>/^README\.md$/i.test(x.path)))out.push(issue("README를 확인하지 못했습니다","높음","확인됨","인수인계","Repository 루트","README.md 파일이 구조에서 보이지 않습니다.","프로젝트 안내 부재","설치·실행·배포·기능 위치 인수인계가 어려워집니다.","목적, 설치, 실행, 환경변수, 배포, 테스트 순서로 README를 작성하세요."));
  return out;
}
function isSensitiveEnvPath(path:string){
  if(!/(^|\/)\.env(?:\.[^/]+)?$/i.test(path))return false;
  return !/\.(example|sample|template|defaults?)$/i.test(path);
}
function detectStack(files:{path:string;content:string}[],blobs:TreeItem[]){
  const all=files.map(x=>x.content).join("\n"); const paths=blobs.map(x=>x.path).join("\n"); const found:string[]=[];
  if(/"next"\s*:|next\.config/i.test(all+paths))found.push("Next.js");
  if(/typescript|"typescript"\s*:/i.test(all+paths)||/\.tsx?$/m.test(paths))found.push("TypeScript");
  if(/"react"\s*:/i.test(all))found.push("React");
  if(/vitest/i.test(all+paths))found.push("Vitest");
  if(/playwright/i.test(all+paths))found.push("Playwright");
  if(/pytest/i.test(all+paths))found.push("Pytest");
  if(/tailwind/i.test(all+paths))found.push("Tailwind CSS");
  return found.slice(0,6);
}
async function inspectUi(url:unknown){
  if(!url)return{status:"UI 화면 미확인",evidence:[],note:"배포 URL이 입력되지 않아 UI 평가를 생성하지 않았습니다."};
  try{
    const {response:r,finalUrl}=await fetchPublicHtml(String(url));
    if(!r.ok)return{status:"UI 화면 미확인",evidence:[],note:`배포 서버가 HTTP ${r.status} 응답을 반환했습니다.`};
    const type=r.headers.get("content-type")||""; if(!type.includes("text/html"))return{status:"UI 화면 미확인",evidence:[],note:"HTML 화면 응답을 읽지 못했습니다."};
    const html=await readTextWithLimit(r,500000); const evidence:string[]=[];
    if(finalUrl!==String(url))evidence.push("공개 주소의 안전한 리디렉션 경로 확인");
    const title=html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim(); if(title)evidence.push(`페이지 제목 확인: ${title}`);
    if(/name=["']viewport["']/i.test(html))evidence.push("모바일 viewport 설정 확인");
    const buttons=(html.match(/<(button|a)\b/gi)||[]).length;if(buttons)evidence.push(`버튼·링크 요소 약 ${buttons}개 확인`);
    const forms=(html.match(/<(input|textarea|select|form)\b/gi)||[]).length;if(forms)evidence.push(`입력폼 관련 요소 약 ${forms}개 확인`);
    const lang=html.match(/<html[^>]*lang=["']([^"']+)/i)?.[1];if(lang)evidence.push(`문서 언어 설정 확인: ${lang}`);
    return{status:"일부 확인",evidence,note:"배포 HTML 응답은 확인했습니다. 로그인 후 화면, 실제 클릭 동작, 겹침·잘림·색 대비는 브라우저 실사용 확인이 필요합니다."};
  }catch(error){
    const message=error instanceof Error?error.message:"";
    if(message==="BLOCKED_HOST")return{status:"UI 화면 미확인",evidence:[],note:"보안을 위해 로컬·사설 네트워크 또는 메타데이터 주소는 확인하지 않습니다."};
    if(message==="RESPONSE_TOO_LARGE")return{status:"UI 화면 미확인",evidence:[],note:"화면 응답이 500KB를 넘어 안전을 위해 수집을 중단했습니다."};
    if(message==="FETCH_TIMEOUT")return{status:"UI 화면 미확인",evidence:[],note:"배포 화면이 제한 시간 안에 응답하지 않아 수집을 중단했습니다."};
    return{status:"UI 화면 미확인",evidence:[],note:"주소 오류, 로그인 필요, 서버 오류 또는 화면 수집 제한으로 확인하지 못했습니다."};
  }
}

const redirectStatuses=new Set([301,302,303,307,308]);

async function fetchPublicHtml(input:string){
  let current=new URL(input);
  for(let redirects=0;redirects<=4;redirects++){
    assertPublicUrl(current);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    let response:Response;
    try{
      response=await fetch(current,{redirect:"manual",signal:controller.signal,headers:{"User-Agent":"Vibe-Code-Review-Lab","Accept":"text/html,application/xhtml+xml"}});
    }catch(error){
      if(error instanceof Error&&error.name==="AbortError")throw new Error("FETCH_TIMEOUT");
      throw error;
    }finally{clearTimeout(timer)}
    if(!redirectStatuses.has(response.status))return{response,finalUrl:current.toString()};
    const location=response.headers.get("location");
    if(!location)throw new Error("INVALID_REDIRECT");
    current=new URL(location,current);
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

function assertPublicUrl(url:URL){
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error("BLOCKED_HOST");
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,"").replace(/\.$/,"");
  if(!host||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.endsWith(".home.arpa")||host==="metadata.google.internal")throw new Error("BLOCKED_HOST");
  if(isBlockedIpv4(host)||isBlockedIpv6(host))throw new Error("BLOCKED_HOST");
}

function isBlockedIpv4(host:string){
  if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host))return false;
  const parts=host.split(".").map(Number);
  if(parts.some(x=>x<0||x>255))return true;
  const [a,b]=parts;
  return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===0)||(a===192&&b===168)||(a===198&&b>=18&&b<=19);
}

function isBlockedIpv6(host:string){
  if(!host.includes(":"))return false;
  const value=host.toLowerCase();
  if(value==="::"||value==="::1"||value.startsWith("fc")||value.startsWith("fd")||value.startsWith("fe8")||value.startsWith("fe9")||value.startsWith("fea")||value.startsWith("feb"))return true;
  const mapped=value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  return mapped?isBlockedIpv4(mapped[1]):false;
}

async function readTextWithLimit(response:Response,maxBytes:number){
  const declared=Number(response.headers.get("content-length")||0);
  if(declared>maxBytes)throw new Error("RESPONSE_TOO_LARGE");
  if(!response.body)return"";
  const reader=response.body.getReader();const decoder=new TextDecoder();let received=0;let text="";const deadline=Date.now()+8000;
  try{
    while(true){
      const remaining=deadline-Date.now();if(remaining<=0)throw new Error("FETCH_TIMEOUT");
      const {done,value}=await Promise.race([
        reader.read(),
        new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("FETCH_TIMEOUT")),remaining))
      ]);
      if(done)break;
      received+=value.byteLength;if(received>maxBytes)throw new Error("RESPONSE_TOO_LARGE");
      text+=decoder.decode(value,{stream:true});
    }
    return text+decoder.decode();
  }finally{await reader.cancel().catch(()=>{})}
}
