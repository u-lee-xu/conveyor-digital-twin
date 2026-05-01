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

  // 截图初始状态
  await page.screenshot({
    path: '/home/lee/edgecom/digital-twin-v3/mobile-drawer-closed.jpg',
    fullPage: true
  });
  console.log('✅ 已截图: mobile-drawer-closed.jpg');

  // 检查所有按钮
  console.log('\n📱 检查页面中的所有按钮:');
  const allButtons = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.map(btn => ({
      text: btn.textContent.trim(),
      ariaLabel: btn.getAttribute('aria-label'),
      className: btn.className,
      id: btn.id
    }));
  });
  console.log(JSON.stringify(allButtons, null, 2));

  // 尝试点击第一个包含"控制"的按钮
  console.log('\n📱 测试2: 尝试打开控制面板');
  const controlButtonClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const controlBtn = buttons.find(btn =>
      btn.textContent.includes('控制') ||
      btn.getAttribute('aria-label')?.includes('控制')
    );
    if (controlBtn) {
      controlBtn.click();
      return true;
    }
    return false;
  });

  if (controlButtonClicked) {
    console.log('✅ 控制按钮点击成功');
    await page.waitForTimeout(1000);

    // 截图打开状态
    await page.screenshot({
      path: '/home/lee/edgecom/digital-twin-v3/mobile-drawer-open.jpg',
      fullPage: true
    });
    console.log('✅ 已截图: mobile-drawer-open.jpg');

    // 检查抽屉高度
    console.log('\n📱 测试3: 检查抽屉高度');
    const drawerInfo = await page.evaluate(() => {
      // 查找抽屉元素
      const drawers = [
        document.querySelector('.drawer-content'),
        document.querySelector('[data-state="open"]'),
        document.querySelector('.panel-content')
      ];

      for (const drawer of drawers) {
        if (drawer) {
          const styles = getComputedStyle(drawer);
          return {
            found: true,
            height: styles.height,
            maxHeight: styles.maxHeight,
            backgroundColor: styles.backgroundColor,
            position: styles.position,
            bottom: styles.bottom
          };
        }
      }
      return { found: false };
    });
    console.log('抽屉信息:', JSON.stringify(drawerInfo, null, 2));

    // 检查3D场景可见区域
    console.log('\n📱 测试4: 检查3D场景可见区域');
    const sceneInfo = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        width: rect.width,
        visiblePercentage: Math.round((rect.height / 844) * 100)
      };
    });
    console.log('3D场景信息:', JSON.stringify(sceneInfo, null, 2));

    // 检查按钮配色
    console.log('\n📱 测试5: 检查按钮配色');
    const buttonColors = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const result = {};

      buttons.forEach(btn => {
        const text = btn.textContent.trim();
        if (text && text.length < 10) { // 只取短文本按钮
          const styles = getComputedStyle(btn);
          result[text] = {
            background: styles.background,
            color: styles.color,
            boxShadow: styles.boxShadow,
            fontSize: styles.fontSize
          };
        }
      });

      return result;
    });
    console.log('按钮配色:', JSON.stringify(buttonColors, null, 2));

    // 检查面板标题
    console.log('\n📱 测试6: 检查面板标题');
    const titleInfo = await page.evaluate(() => {
      const titles = [
        document.querySelector('h2'),
        document.querySelector('.text-xl'),
        document.querySelector('.text-lg')
      ];

      for (const title of titles) {
        if (title) {
          const styles = getComputedStyle(title);
          return {
            text: title.textContent.trim(),
            fontSize: styles.fontSize,
            fontWeight: styles.fontWeight,
            color: styles.color
          };
        }
      }
      return null;
    });
    console.log('标题信息:', JSON.stringify(titleInfo, null, 2));

    // 截图按钮特写
    console.log('\n📱 测试7: 截图按钮特写');
    await page.screenshot({
      path: '/home/lee/edgecom/digital-twin-v3/mobile-buttons-closeup.jpg',
      clip: { x: 0, y: 350, width: 375, height: 350 }
    });
    console.log('✅ 已截图: mobile-buttons-closeup.jpg');
  } else {
    console.log('❌ 未找到控制按钮');
  }

  await browser.close();
  console.log('\n✅ 测试完成！');
})();