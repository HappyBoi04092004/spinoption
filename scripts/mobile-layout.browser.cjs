'use strict';
// Native Chromium runs only in the existing unprivileged PR build job.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {execFileSync} = require('node:child_process');
const baselineCommit = 'aacab5ccb8400cfb68fb8a07ae7f2d0e7d0bc825';
const {chromium} = require('playwright');
const cfg = {"slug": "random-picker", "phone": 620, "badge": "[data-i18n=\"localBadge\"]", "ja": "候補は端末内だけで処理", "en": "Processed only on this device", "hide": 0, "build": true, "details": false, "end": "#builtAt", "close": "#helpCloseButton"};
const evidence = path.resolve('test-results/mobile-layout');
async function bounds(locator, width, height, label, vertical = true) {
  const r = await locator.boundingBox();
  assert.ok(r && r.x >= -1 && r.x + r.width <= width + 1 && (!vertical || (r.y >= -1 && r.y + r.height <= height + 1)), label + ': controls fit viewport');
}
async function layoutMetrics(page) {
  return page.evaluate(() => {
    const el=document.querySelector('#shareCandidatesWrap'), r=el.getBoundingClientRect(), p=getComputedStyle(el,'::after');
    const outerWidth=parseFloat(p.width)+(p.boxSizing==='border-box'?0:parseFloat(p.paddingLeft)+parseFloat(p.paddingRight)+parseFloat(p.borderLeftWidth)+parseFloat(p.borderRightWidth));
    const tooltipRight=r.left+parseFloat(p.left)+new DOMMatrix(p.transform).m41+outerWidth;
    const x=scrollX,y=scrollY;scrollTo({left:1000,top:y,behavior:'instant'});const canScrollX=scrollX;scrollTo({left:x,top:y,behavior:'instant'});
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,canScrollX,
      tooltip:{right:tooltipRight,opacity:p.opacity,content:p.content},
      visibleOverflow:[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,id:el.id,left:r.left,right:r.right};}).filter(r=>r.right>innerWidth+.5||r.left<-.5).slice(0,12)};
  });
}
async function baselineLayout(browser, file, language, width, height) {
  const context=await browser.newContext({viewport:{width,height},locale:language,reducedMotion:'reduce'});
  try {
    const page=await context.newPage();await page.goto(pathToFileURL(file).href);await page.locator('#helpButton').waitFor();
    if(await page.locator('html').getAttribute('lang')!==language)await page.locator('#languageButton').click();
    return await layoutMetrics(page);
  } finally {await context.close();}
}
async function controls(page, width, height, label) {
  if (cfg.slug === 'developer-toolbox') {
    assert.equal(await page.locator('#mobileToolsButton').isVisible(), width <= cfg.phone, label + ': tool picker breakpoint');
    if (width <= cfg.phone) {
      await page.locator('#mobileToolsButton').click();
      await page.locator('#pickerSearch').fill('base64');
      await page.locator('#pickerSearch').press('Enter');
      assert.equal(await page.locator('#toolPickerDialog').isVisible(), false);
    }
    await page.locator('#base64Input').fill('synthetic');
    await page.locator('#base64Encode').click();
    assert.equal(await page.locator('#base64Output').textContent(), 'c3ludGhldGlj');
  } else if (cfg.slug === 'random-picker') {
    await page.locator('#candidateInput').fill('Alpha\nBeta\nGamma');
    const run = page.locator('#runButton');
    assert.equal(await run.isEnabled(), true, label + ': Run enabled');
    await run.scrollIntoViewIfNeeded();
    await bounds(run, width, height, label);
    assert.equal(await run.evaluate(el => getComputedStyle(el).position), width <= cfg.phone ? 'sticky' : 'static');
    await run.click();
    await page.locator('.winner-name').waitFor();
    assert.ok(['Alpha','Beta','Gamma'].includes((await page.locator('.winner-name').textContent()).trim()));
  } else {
    // Do not request sensors or permissions. Exercise the ordinary waiting-state UI.
    assert.equal(await page.locator('.control-dock button').count(), 4);
    assert.equal(await page.locator('#zeroButton').isDisabled(), true);
    assert.equal(await page.locator('#holdButton').isDisabled(), true);
    await page.locator('#edgeModeButton').click();
    assert.equal(await page.locator('#edgeModeButton').getAttribute('aria-selected'), 'true');
    await page.locator('#flatModeButton').click();
    await page.locator('#settingsButton').click();
    assert.equal(await page.locator('#settingsDialog').isVisible(), true);
    await page.keyboard.press('Escape');
    if (width <= cfg.phone) await bounds(page.locator('.control-dock'), width, height, label);
  }
}
async function main() {
  fs.mkdirSync(evidence, {recursive:true});
  // Copy the exact shipped immutable baseline, without editing its HTML or substituting a fallback.
  const baselineFile=path.join(process.env.RUNNER_TEMP,'random-picker-baseline.html');
  fs.writeFileSync(baselineFile,execFileSync('git',['show',baselineCommit+':random-picker.html'],{maxBuffer:1024*1024}));
  const browser = await chromium.launch();
  try {
    const cases = [];
    for (const language of ['ja','en']) for (const [width,height] of [[1360,900],[cfg.phone+1,568],[cfg.phone,568],[320,568],[393,252]]) cases.push({file:'dist/index.html',language,width,height});
    cases.push({file:'dist/index.self-extract.html',language:'en',width:360,height:640});
    cases.push({file:cfg.slug+'.html',language:'ja',width:1360,height:900});
    for (const {file,language,width,height} of cases) {
      const context = await browser.newContext({viewport:{width,height},locale:language,reducedMotion:'reduce'});
      const page = await context.newPage(), errors = [], requests = [];
      const label = `${file} ${language} ${width}x${height}`;
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
      try {
        await page.goto(pathToFileURL(path.resolve(file)).href + (cfg.slug === 'developer-toolbox' ? '#base64' : ''));
        await page.locator('#helpButton').waitFor();
        if (await page.locator('html').getAttribute('lang') !== language) await page.locator('#languageButton').click();
        // The candidate-specific dictionary entry is unused; do not invent a badge.
        assert.equal(await page.locator('.local-badge').count(),0,label + ': no privacy badge added');
        assert.equal(await page.locator('body > footer').isVisible(), width > cfg.phone, label + ': informational footer');
        const initialLayout = await layoutMetrics(page);
        await controls(page, width, height, label);
        for (const w of [cfg.phone+1,cfg.phone,width]) {
          await page.setViewportSize({width:w,height});
          assert.equal(await page.locator('body > footer').isVisible(), w > cfg.phone, label + ': footer resize');
        }
        await page.evaluate(() => scrollTo(0,0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const finalLayout = await layoutMetrics(page);
        if(finalLayout.scrollWidth>width) {
          // Existing file:// disabled-Share tooltip overflow is not part of this footer/Help change.
          // Require exact immutable-baseline geometry, the same invisible tooltip cause, and no visible box overflow.
          const baseline=await baselineLayout(browser,baselineFile,language,width,height);
          assert.ok(width<=cfg.phone,label+': only known phone tooltip overflow is permitted');
          for(const layout of [initialLayout,finalLayout,baseline]) {
            assert.deepEqual(layout.visibleOverflow,[],label+': visible elements remain inside viewport');
            assert.equal(layout.tooltip.opacity,'0',label+': known tooltip is not displayed');
            assert.equal(Math.ceil(layout.tooltip.right),layout.scrollWidth,label+': overflow belongs only to known tooltip');
            assert.equal(layout.scrollWidth,baseline.scrollWidth,label+': no overflow increase over immutable baseline');
            assert.equal(layout.canScrollX,baseline.canScrollX,label+': horizontal scrolling unchanged from baseline');
            assert.equal(layout.tooltip.content,baseline.tooltip.content,label+': same file-only tooltip');
          }
          console.log('BASELINE LIMITATION '+label+' '+JSON.stringify({commit:baselineCommit,baseline,current:finalLayout}));
        } else assert.ok(finalLayout.scrollWidth<=width,label+': page width');
        if (cfg.slug === 'pocket-level' && width <= cfg.phone) await bounds(page.locator('.control-dock'),width,height,label);
        if (file === 'dist/index.html' && [1360,320].includes(width)) await page.screenshot({path:path.join(evidence,`${language}-${width}.png`)});
        await page.locator('#helpButton').click();
        const body = page.locator('#helpDialog .dialog-body');
        if (cfg.build) {
          assert.equal(await page.locator('main #buildVersion, footer #buildVersion').count(),0, label + ': build metadata left main/footer');
          assert.match(await page.locator('#buildVersion').textContent(),/\d/);
          assert.notEqual((await page.locator('#builtAt').textContent()).trim(),'—');
          if (cfg.details) {
            const summary = page.locator('#helpDialog .build-details summary');
            await summary.focus();
            await summary.press('Enter');
            assert.equal(await page.locator('#helpDialog').isVisible(),true,label + ': keyboard disclosure keeps Help open');
            assert.equal(await page.locator('#helpDialog .build-details').getAttribute('open'),'');
          }
        }
        await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
        const end = await page.locator(cfg.end).evaluate(el => {
          const r=el.getBoundingClientRect(); let top=0,bottom=innerHeight;
          for(let p=el.parentElement;p;p=p.parentElement) { const s=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(s.overflowY)){const b=p.getBoundingClientRect();top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);} }
          return {top:r.top,bottom:r.bottom,clipTop:top,clipBottom:bottom};
        });
        assert.ok(end.top >= end.clipTop-1 && end.bottom <= end.clipBottom+1,label + ': final Help content reachable '+JSON.stringify(end));
        assert.ok(await body.evaluate(el => el.scrollWidth <= el.clientWidth+1),label + ': Help width');
        await bounds(page.locator('#helpDialog .dialog-header'),width,height,label);
        const modal = await page.locator('#helpDialog').boundingBox();
        const backdrop = [[1,1],[width-1,1],[1,height-1],[width-1,height-1]].find(([x,y]) => x < modal.x || x > modal.x+modal.width || y < modal.y || y > modal.y+modal.height);
        assert.ok(backdrop, label + ': genuine backdrop point available');
        const y=await page.evaluate(() => scrollY);
        await page.mouse.move(...backdrop);await page.mouse.wheel(0,400);await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => scrollY),y,label + ': modal background locked');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#helpDialog').isVisible(),false,label + ': Escape');
        await page.locator('#helpButton').click();await page.locator(cfg.close).click();
        assert.equal(await page.locator('#helpDialog').isVisible(),false,label + ': close after reopen');
        assert.deepEqual(errors,[],label + ': console errors');assert.deepEqual(requests,[],label + ': external runtime requests');
        console.log('PASS '+label);
      } catch(error) { await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});throw new Error(label+': '+error.message,{cause:error}); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error => {console.error(error);process.exitCode=1;});
