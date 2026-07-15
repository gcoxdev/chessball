const CDP_HTTP = process.env.CHESSBALL_CDP_HTTP ?? 'http://127.0.0.1:9224';
const PREVIEW_URL = process.env.CHESSBALL_PREVIEW_URL ?? 'http://127.0.0.1:4177/';
const APPROVED_FORMATIONS = {
  offense: [
    ['i-form', 'I-Form'],
    ['shotgun', 'Shotgun'],
    ['singleback', 'Singleback'],
    ['pistol', 'Pistol'],
    ['trips', 'Trips'],
    ['power', 'Power'],
  ],
  defense: [
    ['4-3', '4-3'],
    ['nickel', 'Nickel'],
    ['goal-line', 'Goal Line'],
    ['bear-front', 'Bear Front'],
    ['pressure', 'Pressure'],
    ['deep-shell', 'Deep Shell'],
  ],
};
const APPROVED_PREVIEWS = {
  offense: {
    value: 'trips',
    description: 'Three eligible receivers overload one side and concede the weak side.',
  },
  defense: {
    value: 'deep-shell',
    description: 'Deep, wide coverage protects passes and softens underneath run support.',
  },
};
const APPROVED_SELECT_COLORS = {
  foreground: 'rgb(249, 231, 182)',
  background: 'rgb(16, 34, 25)',
};
const exactObject = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const version = await (await fetch(`${CDP_HTTP}/json/version`)).json();
const targets = await (await fetch(`${CDP_HTTP}/json`)).json();
const page = targets.find((target) => target.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('No CDP page target');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const waiters = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
    return;
  }
  const entries = waiters.get(message.method);
  if (!entries) return;
  waiters.delete(message.method);
  for (const resolve of entries) resolve(message.params);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const waitFor = (method) => new Promise((resolve) => {
  const entries = waiters.get(method) ?? [];
  entries.push(resolve);
  waiters.set(method, entries);
});
const evaluate = async (expression) => {
  const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? 'Runtime evaluation failed');
  return value.result.value;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clickSelector = (selector) => evaluate(`(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!node) return false; node.click(); return true; })()`);
const clickText = (text) => evaluate(`(() => { const node=[...document.querySelectorAll('button')].find((item)=>item.textContent.trim()===${JSON.stringify(text)}&&!item.disabled); if(!node) return false; node.click(); return true; })()`);

await send('Page.enable');
await send('Runtime.enable');

async function navigate(viewport) {
  await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: PREVIEW_URL });
  await loaded;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(`document.readyState==='complete'&&Boolean(document.querySelector('#game-workspace'))`)) return;
    await delay(25);
  }
  throw new Error('Preview not ready');
}

async function measureHeading(viewport) {
  await navigate(viewport);
  const geometry = await evaluate(`(() => {
    const rect=(node)=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,right:r.right,bottom:r.bottom,left:r.left}};
    const heading=document.querySelector('#game-workspace');const strip=document.querySelector('.score-strip');const color=getComputedStyle(heading).color;const channels=color.match(/[\\d.]+/g)?.map(Number)??[];
    return{heading:rect(heading),score_strip:rect(strip),color,foreground_rgb:channels.slice(0,3),foreground_alpha:channels[3]??1,text:heading.textContent,wraps:heading.getClientRects().length>1,document:{scroll_width:document.documentElement.scrollWidth,client_width:document.documentElement.clientWidth},inner:{width:innerWidth,height:innerHeight}};
  })()`);
  await evaluate(`(() => {const style=document.createElement('style');style.id='contrast-isolation';style.textContent='#game-workspace{color:transparent!important;text-shadow:none!important}#game-workspace::after{display:none!important}';document.head.append(style)})()`);
  await delay(20);
  const backgroundShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const backgroundBytes = Math.floor(backgroundShot.data.length * 3 / 4);
  const contrast = await evaluate(`(async () => {
    const data=${JSON.stringify(`data:image/png;base64,${backgroundShot.data}`)};const rect=${JSON.stringify(geometry.heading)};
    const image=new Image();image.src=data;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);const x=Math.max(0,Math.floor(rect.left));const y=Math.max(0,Math.floor(rect.top));const width=Math.min(image.width-x,Math.ceil(rect.right)-x);const height=Math.min(image.height-y,Math.ceil(rect.bottom)-y);const pixels=context.getImageData(x,y,width,height).data;
    const fg=${JSON.stringify(geometry.foreground_rgb)};if(fg.length!==3||fg.some((value)=>!Number.isFinite(value)))throw new Error('Computed heading foreground is not an RGB color');const luminance=(rgb)=>{const c=rgb.map((value)=>{const n=value/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]};const fgL=luminance(fg);let minimum=Infinity;let maximum=0;let worst=null;const unique=new Set();
    for(let i=0;i<pixels.length;i+=4){const bg=[pixels[i],pixels[i+1],pixels[i+2]];const bgL=luminance(bg);const ratio=(Math.max(fgL,bgL)+.05)/(Math.min(fgL,bgL)+.05);if(ratio<minimum){minimum=ratio;worst=bg}if(ratio>maximum)maximum=ratio;unique.add(bg.join(','))}
    return{method:'WCAG 2 relative luminance using the rendered heading computed foreground RGB against every pixel in a CDP background-only screenshot of the heading rectangle; heading color, text-shadow, and accent were hidden so body gradients remained composited',foreground_rgb:fg,sampled_rect:{x,y,width,height},sampled_pixels:width*height,unique_background_colors:unique.size,minimum_ratio:minimum,maximum_ratio:maximum,worst_background_rgb:worst,threshold:4.5,pass:minimum>=4.5,shadow_treatment:'Text shadow was removed only for background isolation and is not relied upon; a normal screenshot is captured separately.'};
  })()`);
  backgroundShot.data = '';
  await evaluate(`document.querySelector('#contrast-isolation')?.remove()`);
  await evaluate(`document.querySelector('.skip-link').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await delay(20);
  const focus = await evaluate(`(() => {const style=getComputedStyle(document.querySelector('#game-workspace'));return{active_id:document.activeElement?.id,outline:style.outline,pass:document.activeElement?.id==='game-workspace'&&style.outlineStyle!=='none'&&parseFloat(style.outlineWidth)>=3}})()`);
  return { ...geometry, contrast, focus, background_screenshot_bytes_before_discard: backgroundBytes };
}

async function badgeGeometry() {
  return evaluate(`(() => {
    const square=document.querySelector('.square.ball-square.occupied');const piece=square?.querySelector('.piece');const ball=square?.querySelector('.football-marker');if(!square||!piece||!ball)throw new Error('Badge fixture missing');
    const rect=(node)=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,right:r.right,bottom:r.bottom,left:r.left,center_x:r.x+r.width/2,center_y:r.y+r.height/2}};
    const snapshot=()=>{const range=document.createRange();range.selectNodeContents(piece);const style=getComputedStyle(piece);const marker=getComputedStyle(ball);const pieceRect=rect(piece);const roleRect=rect(range);return{piece_rect:pieceRect,insets:{top:style.top,right:style.right,bottom:style.bottom,left:style.left,shorthand:style.inset},role_text_rect:roleRect,role_center_delta:{x:roleRect.center_x-pieceRect.center_x,y:roleRect.center_y-pieceRect.center_y},marker_rect:rect(ball),marker_position:{top:marker.top,right:marker.right,z_index:marker.zIndex}}};
    const before=snapshot();const after={};for(const target of ['pass-target','tackle-target']){square.classList.add(target);const state=snapshot();const badge=getComputedStyle(square,'::before');state.badge={content:badge.content,normalized_content:badge.content.replace(/^["']|["']$/g,''),left:badge.left,right:badge.right,bottom:badge.bottom,width:badge.width,height:badge.height,z_index:badge.zIndex};state.piece_geometry_identical=JSON.stringify(state.piece_rect)===JSON.stringify(before.piece_rect)&&JSON.stringify(state.insets)===JSON.stringify(before.insets);state.marker_geometry_identical=JSON.stringify(state.marker_rect)===JSON.stringify(before.marker_rect)&&JSON.stringify(state.marker_position)===JSON.stringify(before.marker_position);state.role_centered=Math.abs(state.role_center_delta.x)<=1&&Math.abs(state.role_center_delta.y)<=1;state.marker_top_right=state.marker_position.top==='3px'&&state.marker_position.right==='3px'&&state.marker_position.z_index==='3';square.classList.remove(target);after[target]=state}return{before,after};
  })()`);
}

async function reachFormation(viewport, includeBadge = false) {
  await navigate(viewport);await clickSelector('button[aria-label="Away Human"]');await delay(20);await clickText('Start Game');await delay(30);await clickText('Flip Coin');await delay(30);await clickText('Receive');await delay(30);const badges=includeBadge?await badgeGeometry():undefined;
  for(let step=0;step<220;step+=1){if(await evaluate(`Boolean(document.querySelector('.formation-picker'))`))return badges;const progress=await evaluate(`(() => {const button=(text)=>[...document.querySelectorAll('button')].find((node)=>node.textContent.trim()===text&&!node.disabled);const kickoff=button('Kickoff');if(kickoff){kickoff.click();return'kickoff'}const next=button('Next');if(next){next.click();return'next'}const kick=document.querySelector('.kick-target');if(kick){kick.click();return'place'}const ball=document.querySelector('.square.ball-square');const turnText=document.querySelector('.field-meta')?.textContent??'';const turn=turnText.includes('HOME to act')?'home':turnText.includes('AWAY to act')?'away':null;if(!turn)return'no-turn';const coords=(node)=>node.title.split(',').map(Number);const target=ball?coords(ball):[12,5];const distance=(node)=>{const[x,y]=coords(node);return Math.abs(x-target[0])+Math.abs(y-target[1])};const tackle=document.querySelector('.tackle-target');if(tackle){tackle.click();return'tackle'}const recovery=document.querySelector('.move-target.ball-square');if(recovery){recovery.click();return'recover'}const moves=[...document.querySelectorAll('.move-target')];if(moves.length){moves.sort((a,b)=>distance(a)-distance(b))[0].click();return'move'}const pieces=[...document.querySelectorAll('.square.occupied.'+turn)];if(pieces.length){pieces.sort((a,b)=>distance(a)-distance(b))[0].click();return'select'}return'no-action'})()`);if(progress==='no-turn'||progress==='no-action')throw new Error('Formation navigation failed: '+progress);await delay(15)}throw new Error('Formation panel timeout');
}

async function measureAndConfirm(viewport, side, includeBadge = false) {
  const badges=await reachFormation(viewport,includeBadge);
  const controls=await evaluate(`(() => {const rect=(node)=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,right:r.right,bottom:r.bottom,left:r.left}};const signature=()=>[...document.querySelectorAll('.square.occupied')].map((node)=>node.title+':'+node.querySelector('.piece')?.textContent).join('|');const output={};for(const side of ['offense','defense']){const select=document.querySelector('#'+side+'-formation');const label=document.querySelector('label[for="'+side+'-formation"]');const description=document.getElementById(select.getAttribute('aria-describedby'));const confirm=[...document.querySelectorAll('button')].find((node)=>node.textContent.trim()==='Confirm '+side[0].toUpperCase()+side.slice(1));const status=select.closest('.formation-picker').querySelector('.formation-status');const selectStyle=getComputedStyle(select);output[side]={select:rect(select),label:rect(label),description:rect(description),confirm:rect(confirm),label_text:label.textContent.trim(),description_text:description.textContent.trim(),status_text:status.textContent.trim(),gap_description_to_confirm:rect(confirm).top-rect(description).bottom,no_overlap:rect(confirm).top>=rect(description).bottom,label_bound:label.htmlFor===select.id,description_bound:description.id===select.getAttribute('aria-describedby'),options:[...select.options].map((option)=>[option.value,option.textContent.trim()]),foreground_color:selectStyle.color,background_color:selectStyle.backgroundColor,touch_height_exact:rect(select).height===44,visible:rect(select).width>0&&rect(select).height>0&&rect(label).width>0&&rect(label).height>0&&rect(description).width>0&&rect(description).height>0&&rect(confirm).width>0&&rect(confirm).height>0,enabled_before_confirm:!select.disabled&&!confirm.disabled}}return{controls:output,board_signature:signature()}})()`);
  const selector=`#${side}-formation`;const selected=APPROVED_PREVIEWS[side].value;await evaluate(`(() => {const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(selected)};node.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(25);
  const preview=await evaluate(`(() => {const signature=()=>[...document.querySelectorAll('.square.occupied')].map((node)=>node.title+':'+node.querySelector('.piece')?.textContent).join('|');const node=document.querySelector(${JSON.stringify(selector)});const description=document.getElementById(node.getAttribute('aria-describedby'));return{value:node.value,description:description.textContent,board_signature:signature()}})()`);preview.board_changed=preview.board_signature!==controls.board_signature;
  await clickText(`Confirm ${side[0].toUpperCase()}${side.slice(1)}`);await delay(30);const confirmed=await evaluate(`(() => {const select=document.querySelector(${JSON.stringify(selector)});const confirm=[...document.querySelectorAll('button')].find((node)=>node.textContent.trim()===${JSON.stringify(`Confirm ${side[0].toUpperCase()}${side.slice(1)}`)});const description=select&&document.getElementById(select.getAttribute('aria-describedby'));const status=select?.closest('.formation-picker')?.querySelector('.formation-status');return{selector_present:Boolean(select),selector_disabled:select?.disabled===true,confirm_present:Boolean(confirm),confirm_disabled:confirm?.disabled===true,panel_present:Boolean(document.querySelector('.formation-panel')),value:select?.value,description:description?.textContent.trim(),status_text:status?.textContent.trim()}})()`);return{controls:controls.controls,preview,confirmed,badges};
}

const viewports=[{width:1440,height:900},{width:390,height:844},{width:320,height:568}];const results=[];
try {
  for(const viewport of viewports){const heading=await measureHeading(viewport);const offense=await measureAndConfirm(viewport,'offense',true);const defense=await measureAndConfirm(viewport,'defense');const normalShot=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});const normalBytes=Math.floor(normalShot.data.length*3/4);normalShot.data='';results.push({viewport,heading,controls:offense.controls,confirmation:{offense:{preview:offense.preview,...offense.confirmed},defense:{preview:defense.preview,...defense.confirmed}},badges:offense.badges,screenshot:{normal_encoded_bytes_before_discard:normalBytes,background_encoded_bytes_before_discard:heading.background_screenshot_bytes_before_discard,disposition:'base64 discarded in memory; no PNG written'}})}
  for(const result of results){
    const desktop=result.viewport.width===1440;
    if(result.heading.inner.width!==result.viewport.width||result.heading.inner.height!==result.viewport.height)throw new Error('Viewport metrics contract failed');
    if(result.heading.document.scroll_width!==result.heading.document.client_width)throw new Error('Horizontal overflow');
    if(desktop&&result.heading.score_strip.height>139.25)throw new Error('Desktop score strip enlarged');
    if(result.heading.text!=='Chessball'||result.heading.wraps||!result.heading.focus.pass||!result.heading.contrast.pass)throw new Error('Heading contract failed');
    if(result.heading.foreground_alpha!==1||!exactObject(result.heading.foreground_rgb,result.heading.contrast.foreground_rgb))throw new Error('Heading computed foreground contract failed');
    if(result.heading.contrast.sampled_pixels<=0||result.heading.background_screenshot_bytes_before_discard<=0||result.screenshot.normal_encoded_bytes_before_discard<=0)throw new Error('Screenshot sampling contract failed');
    for(const side of ['offense','defense']){
      const control=result.controls[side];const confirmation=result.confirmation[side];const expectedPreview=APPROVED_PREVIEWS[side];
      if(!control.label_bound||!control.description_bound||!control.visible||control.label_text!==`${side[0].toUpperCase()}${side.slice(1)} formation`||control.status_text!=='Pending')throw new Error(`${side} accessible control contract failed`);
      if(!exactObject(control.options,APPROVED_FORMATIONS[side]))throw new Error(`${side} ordered option contract failed`);
      if(control.select.height!==44||!control.touch_height_exact)throw new Error(`${side} exact touch-height contract failed`);
      if(control.foreground_color!==APPROVED_SELECT_COLORS.foreground||control.background_color!==APPROVED_SELECT_COLORS.background)throw new Error(`${side} explicit color contract failed`);
      if(!control.enabled_before_confirm||!control.no_overlap||control.gap_description_to_confirm!==7)throw new Error(`${side} enabled/crowding contract failed`);
      if(confirmation.preview.value!==expectedPreview.value||confirmation.preview.description!==expectedPreview.description||!confirmation.preview.board_changed)throw new Error(`${side} preview contract failed`);
      if(!confirmation.selector_present||!confirmation.confirm_present||!confirmation.selector_disabled||!confirmation.confirm_disabled||!confirmation.panel_present||confirmation.value!==expectedPreview.value||confirmation.description!==expectedPreview.description||confirmation.status_text!=='Confirmed')throw new Error(`${side} confirmation contract failed`);
    }
    const exactInsets={top:'4px',right:'4px',bottom:'4px',left:'4px',shorthand:'4px'};
    if(!exactObject(result.badges.before.insets,exactInsets)||result.badges.before.marker_position.top!=='3px'||result.badges.before.marker_position.right!=='3px'||result.badges.before.marker_position.z_index!=='3')throw new Error('Base piece/marker geometry contract failed');
    for(const [target,expectedContent] of [['pass-target','P'],['tackle-target','T']]){
      const state=result.badges.after[target];
      const badge_content_correct=state.badge.normalized_content===expectedContent;
      if(!badge_content_correct||state.badge.left!=='1px'||state.badge.bottom!=='1px'||state.badge.width!=='10px'||state.badge.height!=='10px'||state.badge.z_index!=='3')throw new Error(`${target} badge contract failed: ${JSON.stringify(state.badge)}`);
      if(!state.piece_geometry_identical||!exactObject(state.insets,exactInsets)||!state.role_centered||!state.marker_top_right||!state.marker_geometry_identical)throw new Error(`${target} geometry contract failed`);
    }
  }
  console.log(JSON.stringify({schema:'chessball-playbook-polish-rendered-verification-run-v1',browser:version.Browser,protocol_version:version['Protocol-Version'],preview_url:PREVIEW_URL,cdp_http:CDP_HTTP,results,result:'pass'},null,2));
} finally {
  socket.close();
}
