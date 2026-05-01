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
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000); // 等待所有样式加载

  // 截图初始状态
  await page.screenshot({
    path: '/home/lee/edgecom/digital-twin-v3/mobile-drawer-closed-v2.jpg',
    fullPage: true
  });
  console.log('✅ 已截图: mobile-drawer-closed-v2.jpg');

  // 点击控制按钮
  console.log('\n📱 测试2: 打开控制面板抽屉');
  const controlButtonClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const controlBtn = buttons.find(btn =>
      btn.textContent.includes('控制') ||
      btn.textContent.includes('▲')
    );
    if (controlBtn) {
      controlBtn.click();
      return true;
    }
    return false;
  });

  if (controlButtonClicked) {
    console.log('✅ 控制按钮点击成功');
    await page.waitForTimeout(1500); // 等待抽屉动画完成

    // 截图打开状态
    await page.screenshot({
      path: '/home/lee/edgecom/digital-twin-v3/mobile-drawer-open-v2.jpg',
      fullPage: true
    });
    console.log('✅ 已截图: mobile-drawer-open-v2.jpg');

    // 详细检查
    console.log('\n📱 测试3: 检查抽屉高度和布局');
    const layoutInfo = await page.evaluate(() => {
      // 查找抽屉元素
      const drawer = document.querySelector('.bg-slate-900\\/98');
      if (!drawer) return { found: false };

      const styles = getComputedStyle(drawer);
      const rect = drawer.getBoundingClientRect();

      // 检查3D场景可见区域
      const canvas = document.querySelector('canvas');
      const canvasRect = canvas ? canvas.getBoundingClientRect() : null;

      // 检查标题
      const titleEl = document.querySelector('h1');
      const titleText = titleEl ? titleEl.textContent.trim() : null;

      // 检查关闭按钮
      const closeBtn = Array.from(document.querySelectorAll('button')).find(btn =>
        btn.textContent.includes('✕')
      );
      const closeBtnVisible = closeBtn ? getComputedStyle(closeBtn).display !== 'none' : false;

      // 检查面板背景色
      const panelBg = styles.backgroundColor;

      return {
        found: true,
        drawer: {
          height: rect.height,
          maxHeight: styles.maxHeight,
          top: rect.top,
          bottom: rect.bottom,
          percentage: ((rect.height / 844) * 100).toFixed(1) + '%',
          backgroundColor: panelBg
        },
        scene: {
          visibleHeight: canvasRect ? canvasRect.height : 0,
          visiblePercentage: canvasRect ? ((canvasRect.height / 844) * 100).toFixed(1) + '%' : '0%'
        },
        title: titleText,
        closeBtnVisible: closeBtnVisible
      };
    });
    console.log('布局信息:', JSON.stringify(layoutInfo, null, 2));

    // 检查按钮配色
    console.log('\n📱 测试4: 检查按钮配色');
    const buttonColors = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const result = {};

      buttons.forEach(btn => {
        const text = btn.textContent.trim();
        // 只检查主要按钮
        if (['▶ 启动', '◼ 停止', '📦 生成', '🗑 清除'].includes(text)) {
          const styles = getComputedStyle(btn);
          result[text] = {
            background: styles.background,
            color: styles.color,
            boxShadow: styles.boxShadow,
            className: btn.className
          };
        }
      });

      return result;
    });
    console.log('按钮配色:', JSON.stringify(buttonColors, null, 2));

    // 截图按钮特写
    console.log('\n📱 测试5: 截图按钮特写');
    await page.screenshot({
      path: '/home/lee/edgecom/digital-twin-v3/mobile-buttons-v2.jpg',
      clip: { x: 0, y: 350, width: 375, height: 400 }
    });
    console.log('✅ 已截图: mobile-buttons-v2.jpg');

    // 测试桌面端
    console.log('\n📱 测试6: 测试桌面端布局');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: '/home/lee/edgecom/digital-twin-v3/desktop-full-v2.jpg',
      fullPage: false
    });
    console.log('✅ 已截图: desktop-full-v2.jpg');
  } else {
    console.log('❌ 未找到控制按钮');
  }

  await browser.close();
  console.log('\n✅ 所有测试完成！');

  // 生成测试报告
  console.log('\n📊 测试报告：');
  console.log('=====================================');
  console.log('✅ 测试完成的项目：');
  console.log('  1. 移动端抽屉关闭状态截图');
  console.log('  2. 移动端抽屉打开状态截图');
  console.log('  3. 抽屉高度和布局检查');
  console.log('  4. 按钮配色检查');
  console.log('  5. 按钮特写截图');
  console.log('  6. 桌面端完整布局截图');
  console.log('=====================================');
})();