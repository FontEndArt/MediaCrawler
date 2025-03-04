/**
 * MediaCrawler - 快手登录模块
 * 
 * 注意：本项目仅供学习和研究使用，不得用于商业用途
 * 请遵守相关法律法规，合理使用本工具
 * 切勿用于非法用途，否则后果自负
 */

const fs = require('fs').promises;
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const qrcode = require('qrcode');
const utils = require('../../utils');

/**
 * 快手登录类
 */
class KuaishouLogin {
  /**
   * 构造函数
   * @param {Object} options 登录选项
   * @param {string} options.loginType 登录类型：'qrcode'、'cookie'、'phone'
   * @param {Object} options.browserContext 浏览器上下文
   * @param {Object} options.contextPage 浏览器页面
   * @param {string} options.cookieStr Cookie字符串（当loginType为cookie时使用）
   */
  constructor(options) {
    this.loginType = options.loginType || 'qrcode';
    this.browserContext = options.browserContext;
    this.contextPage = options.contextPage;
    this.cookieStr = options.cookieStr || '';
    this.loginPhone = options.loginPhone || '';
    this.tempDir = path.join(process.cwd(), 'temp');
  }

  /**
   * 开始登录流程
   */
  async begin() {
    console.log(`开始${this.loginType}方式登录快手...`);
    
    switch (this.loginType) {
      case 'qrcode':
        await this.loginByQrcode();
        break;
      case 'cookie':
        await this.loginByCookies();
        break;
      case 'phone':
        await this.loginByMobile();
        break;
      default:
        throw new Error('不支持的登录类型，目前仅支持qrcode、cookie或phone');
    }
  }

  /**
   * 通过二维码登录
   */
  async loginByQrcode() {
    console.log('开始二维码登录...');
    
    try {
      // 检查是否有登录按钮
      const loginButton = await this.contextPage.locator('xpath=//p[text()="登录"]').count();
      
      if (loginButton === 0) {
        console.log('未发现登录按钮，可能已经登录');
        // 检查是否已经登录
        const isLoggedIn = await this.checkLoginState();
        if (isLoggedIn) {
          console.log('已检测到登录状态，无需重新登录');
          return true;
        }
        console.log('未检测到登录状态，但页面未显示登录按钮，可能出错');
        throw new Error('无法找到登录按钮');
      }
      
      // 点击登录按钮
      await this.contextPage.locator('xpath=//p[text()="登录"]').click();
      await utils.sleep(1000);
      
      // 找到登录二维码
      const qrcodeImgSelector = '//div[@class="qrcode-img"]//img';
      const qrcodeElement = await this.contextPage.locator(qrcodeImgSelector).first();
      
      if (!qrcodeElement) {
        throw new Error('未找到登录二维码，请检查页面结构是否变化');
      }
      
      // 获取二维码图片的base64数据
      const base64QrcodeImg = await qrcodeElement.getAttribute('src');
      
      if (!base64QrcodeImg) {
        throw new Error('获取二维码失败');
      }
      
      // 确保临时目录存在
      await utils.ensureDir(this.tempDir);
      
      // 保存二维码图片到临时文件
      const qrcodePath = path.join(this.tempDir, 'kuaishou_qrcode.png');
      const base64Data = base64QrcodeImg.replace(/^data:image\/\w+;base64,/, '');
      await fs.writeFile(qrcodePath, base64Data, 'base64');
      
      // 而不是使用open模块打开，直接显示路径让用户手动打开
      console.log('\n========================================');
      console.log('请打开以下路径扫描二维码登录：');
      console.log(qrcodePath);
      console.log('========================================\n');
      
      // 检查登录状态，最多等待60秒
      const startTime = Date.now();
      const timeout = 60000; // 60秒超时
      
      while (Date.now() - startTime < timeout) {
        const isLoggedIn = await this.checkLoginState();
        if (isLoggedIn) {
          console.log('登录成功！');
          // 等待页面跳转和加载完成
          await utils.sleep(5000);
          return true;
        }
        await utils.sleep(1000);
      }
      
      throw new Error('登录超时，请重试');
    } catch (error) {
      console.error('二维码登录失败:', error);
      throw error;
    }
  }

  /**
   * 通过Cookie登录
   */
  async loginByCookies() {
    console.log('开始Cookie登录...');
    
    if (!this.cookieStr) {
      throw new Error('Cookie字符串为空');
    }
    
    try {
      const cookieObj = utils.convertStrCookieToObj(this.cookieStr);
      
      for (const [key, value] of Object.entries(cookieObj)) {
        await this.browserContext.addCookies([{
          name: key,
          value: value,
          domain: '.kuaishou.com',
          path: '/'
        }]);
      }
      
      // 刷新页面应用cookie
      await this.contextPage.reload();
      await utils.sleep(2000);
      
      const isLoggedIn = await this.checkLoginState();
      if (!isLoggedIn) {
        throw new Error('Cookie登录失败，请检查Cookie是否有效');
      }
      
      console.log('Cookie登录成功！');
      return true;
    } catch (error) {
      console.error('Cookie登录失败:', error);
      throw error;
    }
  }

  /**
   * 通过手机号登录（暂未实现）
   */
  async loginByMobile() {
    console.log('手机号登录功能暂未实现');
    throw new Error('手机号登录功能暂未实现');
  }

  /**
   * 检查登录状态
   * @returns {Promise<boolean>} 是否已登录
   */
  async checkLoginState() {
    try {
      const cookies = await this.browserContext.cookies();
      const cookieObj = cookies.reduce((obj, cookie) => {
        obj[cookie.name] = cookie.value;
        return obj;
      }, {});
      
      // 快手登录状态关键cookie是passToken
      return !!cookieObj.passToken;
    } catch (error) {
      console.error('检查登录状态出错:', error);
      return false;
    }
  }
}

module.exports = KuaishouLogin; 