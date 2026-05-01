import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 375, height: 844 }, // iPhone 12
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
  });

  const page = await context.newPage();

  console.log('📱 测试1: 移动端抽屉关闭状态');
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(3000);
  await page.screenshot({
    path: '/home/lee/edgecom/digital-twin-v3/mobile-drawer-closed.jpg',
    fullPage: true
  });
  console.log('✅ 已截图: mobile-drawer-closed.jpg');

  console.log('\n📱 测试2: 打开控制面板抽屉');
  await page.click('button[aria-label="打开控制面板"] .trigger-btn');
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: '/home/lee/edgecom/digital-twin-v3/mobile-drawer-open.jpg',
    fullPage: true
  });
  console.log('✅ 已截图: mobile-drawer-open.jpg');

  console.log('\n📱 测试3: 检查抽屉高度（应为60vh而不是85vh）');
  const drawerHeight = await page.evaluate(() => {
    const drawer = document.querySelector('[data-state="open"] .drawer-content');
    if (!drawer) return null;
    const height = drawer.style.height;
    const computedHeight = getComputedStyle(drawer).height;
    return { inline: height, computed: computedHeight };
  });
  console.log('抽屉高度:', JSON.stringify(drawerHeight, null, 2));

  console.log('\n📱 测试4: 检查3D场景可见区域');
  const sceneVisibility = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      visible: rect.height > 200 // 应该有超过200px的可见区域
    };
  });
  console.log('3D场景可见性:', JSON.stringify(sceneVisibility, null, 2));

  console.log('\n📱 测试5: 检查按钮配色');
  const buttonColors = await page.evaluate(() => {
    const buttons = {
      startBtn: null,
      stopBtn: null,
      extendBtn: null,
      retractBtn: null,
      generateBtn: null,
      clearBtn: null
    };

    const getButtonInfo = (btn) => {
      if (!btn) return null;
      const styles = getComputedStyle(btn);
      return {
        background: styles.background,
        color: styles.color,
        boxShadow: styles.boxShadow
      };
    };

    // 查找各个按钮
    const allButtons = Array.from(document.querySelectorAll('button'));
    allButtons.forEach(btn => {
      const text = btn.textContent.trim();
      if (text.includes('启动')) buttons.startBtn = getButtonInfo(btn);
      if (text.includes('停止')) buttons.stopBtn = getButtonInfo(btn);
      if (text.includes('伸出')) buttons.extendBtn = getButtonInfo(btn);
      if (text.includes('缩回')) buttons.retractBtn = getButtonInfo(btn);
      if (text.includes('生成')) buttons.generateBtn = getButtonInfo(btn);
      if (text.includes('清除')) buttons.clearBtn = getButtonInfo(btn);
    });

    return buttons;
  });
  console.log('按钮配色:', JSON.stringify(buttonColors, null, 2));

  console.log('\n📱 测试6: 检查面板配色');
  const panelColors = await page.evaluate(() => {
    const panel = document.querySelector('[data-state="open"] .drawer-content');
    if (!panel) return null;
    const styles = getComputedStyle(panel);
    return {
      background: styles.background,
      color: styles.color,
      borderColor: styles.borderColor
    };
  });
  console.log('面板配色:', JSON.stringify(panelColors, null, 2));

  console.log('\n📱 测试7: 检查标题文本');
  const titleText = await page.evaluate(() => {
    const titleEl = document.querySelector('[data-state="open"] .drawer-content h2, [data-state="open"] .drawer-content .text-xl');
    return titleEl ? titleEl.textContent.trim() : null;
  });
  console.log('面板标题:', titleText);

  console.log('\n📱 测试8: 检查关闭按钮是否显示');
  const closeBtnVisible = await page.evaluate(() => {
    const closeBtn = document.querySelector('[aria-label="关闭控制面板"]');
    if (!closeBtn) return false;
    const styles = getComputedStyle(closeBtn);
    return styles.display !== 'none' && styles.visibility !== 'hidden';
  });
  console.log('关闭按钮可见:', closeBtnVisible);

  console.log('\n📱 测试9: 测试按钮点击效果');
  const startButton = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(btn => btn.textContent.includes('启动'));
  });

  if (startButton) {
    await startButton.click();
    await page.waitForTimeout(500);
    console.log('✅ 启动按钮点击成功');
  }

  console.log('\n📱 测试10: 截图按钮配色特写');
  await page.screenshot({
    path: '/home/lee/edgecom/digital-twin-v3/mobile-buttons-color.jpg',
    clip: { x: 0, y: 400, width: 375, height: 400 }
  });
  console.log('✅ 已截图: mobile-buttons-color.jpg');

  console.log('\n📱 测试11: 测试文本对比度');
  const contrastCheck = await page.evaluate(() => {
    const panel = document.querySelector('[data-state="open"] .drawer-content');
    if (!panel) return null;

    const styles = getComputedStyle(panel);
    const bgColors = extractColors(styles.backgroundColor);

    // 检查各种文本元素
    const textElements = {
      title: panel.querySelector('h2, .text-xl'),
      body: panel.querySelector('p, .text-base'),
      muted: panel.querySelector('.text-slate-400, .text-gray-400')
    };

    const results = {};
    for (const [key, el] of Object.entries(textElements)) {
      if (el) {
        const elStyles = getComputedStyle(el);
        results[key] = {
          color: elStyles.color,
          fontSize: elStyles.fontSize,
          fontWeight: elStyles.fontWeight
        };
      }
    }

    return { background: bgColors, text: results };
  });
  console.log('文本对比度检查:', JSON.stringify(contrastCheck, null, 2));

  await browser.close();
  console.log('\n✅ 所有移动端测试完成！');

  // 辅助函数：提取颜色
  function extractColors(colorStr) {
    // rgb(15, 23, 42) -> {r: 15, g: 23, b: 42, hex: '#0f172a'}
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return { raw: colorStr };

    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

    return { r, g, b, hex, raw: colorStr };
  }
})();