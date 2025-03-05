/**
 * MediaCrawler
 * 
 * 注意：本项目仅供学习和研究使用，不得用于商业用途
 * 请遵守相关法律法规，合理使用本工具
 * 切勿用于非法用途，否则后果自负
 */

const path = require('path');
const fs = require('fs').promises;
const pLimit = require('p-limit');
const { chromium } = require('playwright');
const moment = require('moment');
const axios = require('axios');
const fsSync = require('fs');

const AbstractCrawler = require('../abstract_crawler');
const KuaiShouClient = require('./client');
const KuaishouLogin = require('./login'); // 导入登录模块
const utils = require('../../utils');
const { formatProxyInfo } = require('../../utils/proxy');

// 用于在控制台显示二维码
const qrcodeTerminal = require('qrcode-terminal');
// 用于从图片中识别二维码
const { Jimp } = require("jimp");
const jsQR = require('jsqr');

class KuaishouCrawler extends AbstractCrawler {
  constructor(config = {}) {
    super();
    // 基础URL
    this.indexUrl = 'https://www.kuaishou.com';
    this.apiUrl = 'https://www.kuaishou.com/graphql';
    
    // 配置
    this.config = config;
    
    // 用户代理
    this.userAgent = utils.getUserAgent();
    
    // 浏览器相关
    this.browser = null;
    this.browserContext = null;
    this.contextPage = null;
    
    // 客户端
    this.ksClient = null;
    
    // 数据根目录 - 使用相对路径
    this.dataRootDir = path.resolve(__dirname, '..', '..', '..', 'data');
    
    // 临时文件目录
    this.tempDir = path.resolve(__dirname, '..', '..', '..', 'temp');
    
    // 浏览器数据目录
    this.browserDataDir = path.resolve(__dirname, '..', '..', '..', 'browser_data');
    
    // 初始化配置
    this.initConfig();
    
    this.concurrencyLimit = 3; // 并发限制
  }
  
  /**
   * 初始化配置
   */
  initConfig() {
    // 默认配置
    const defaultConfig = {
      headless: false,
      max_pages: 3,
      search_keywords: ['搞笑', '宠物'],
      proxy: null,
      login_required: false
    };
    
    // 合并配置
    this.config = { ...defaultConfig, ...this.config };
    
    console.log('配置初始化完成');
  }

  /**
   * 启动爬虫
   */
  async start() {
    try {
      console.log('启动爬虫...');
      
      // 启动浏览器
      this.browserContext = await this.launchBrowser();
      
      // 访问快手首页
      await this.visitHomePage();
      
      // 等待更长时间确保页面完全加载
      console.log('等待页面完全加载...');
      await utils.sleep(3000, 5000);
      
      // 检查登录状态
      const isLoggedIn = await this.checkLoginState();
      console.log(`登录状态检查结果: ${isLoggedIn ? '已登录' : '未登录'}`);
      
      // 如果未登录并且配置了需要登录
      if (!isLoggedIn && this.config.login_required) {
        console.log('需要登录但当前未登录，将尝试登录');
        const loginSuccess = await this.loginByQrcode();
        if (loginSuccess) {
          console.log('登录成功，继续执行后续操作');
        } else {
          console.log('登录失败，将以未登录状态继续执行，部分功能可能受限');
        }
      }
      
      // 创建快手客户端
      this.ksClient = await this.createKsClient();
      
      // 更新客户端cookies
      await this.updateClientCookies();
      
      console.log('爬虫启动完成');
      
      return true;
    } catch (error) {
      console.log('爬虫启动过程中出现错误，但将继续执行:', error);
      
      // 确保客户端已创建
      if (!this.ksClient) {
        try {
          this.ksClient = await this.createKsClient();
        } catch (e) {
          console.log('创建客户端失败，但将继续执行:', e);
          // 创建一个基本的客户端
          const KuaiShouClient = require('./client');
          this.ksClient = new KuaiShouClient({}, this.userAgent);
        }
      }
      
      return true;
    }
  }

  /**
   * 检查登录状态
   * @returns {Promise<boolean>} 是否已登录
   */
  async checkLoginState() {
    try {
      console.log('检查登录状态...');
      
      // 检查页面上是否有登录按钮 - 使用简单的文本内容选择器
      const loginButtonSelector = 'p:has-text("登录")';
      const hasLoginButton = await this.contextPage.$(loginButtonSelector).then(Boolean);
      
      if (!hasLoginButton) {
        console.log('未发现登录按钮，可能已经登录');
        
        // 进一步检查是否有用户头像或其他登录状态指示器
        const userAvatarSelector = '.user-avatar';
        const hasUserAvatar = await this.contextPage.$(userAvatarSelector).then(Boolean);
        
        if (hasUserAvatar) {
          console.log('发现用户头像，确认已登录');
          return true;
        }
        
        // 如果没有明确的登录状态指示器，尝试检查cookies
        const cookies = await this.browserContext.cookies();
        const hasLoginCookies = cookies.some(cookie => 
          (cookie.name === 'userId' || cookie.name === 'passToken' || cookie.name === 'kuaishou.web.cp.api_st') && cookie.value
        );
        
        if (hasLoginCookies) {
          console.log('发现登录cookies，确认已登录');
          return true;
        }
        
        // 尝试检查是否能访问个人相关页面
        try {
          console.log('尝试访问一个需要登录的子页面验证登录状态...');
          // 保存当前URL以便稍后返回
          const currentUrl = this.contextPage.url();
          
          // 访问一个通常需要登录的页面
          await this.contextPage.goto('https://www.kuaishou.com/settings/profile', { waitUntil: 'domcontentloaded' });
          await this.contextPage.waitForTimeout(2000);
          
          // 检查是否重定向到登录页面
          const afterUrl = this.contextPage.url();
          if (afterUrl.includes('settings/profile')) {
            console.log('能够访问个人设置页面，确认已登录');
            // 返回原页面
            await this.contextPage.goto(currentUrl, { waitUntil: 'domcontentloaded' });
            return true;
          }
          
          // 返回原页面
          await this.contextPage.goto(currentUrl, { waitUntil: 'domcontentloaded' });
        } catch (e) {
          console.log('尝试访问个人页面验证登录状态失败:', e.message);
        }
        
        console.log('未找到明确的登录状态指示，将尝试登录');
        return false;
      }
      
      console.log('发现登录按钮，未登录状态');
      return false;
    } catch (error) {
      console.error('检查登录状态出错:', error);
      return false;
    }
  }

  /**
   * 通过二维码登录
   */
  async loginByQrcode() {
    console.log('开始二维码登录...');
    
    try {
      // 创建临时目录
      await utils.ensureDir(this.tempDir);
      
      // 设置二维码保存路径
      const qrcodePath = path.join(this.tempDir, 'kuaishou_qrcode.png');
      
      // 检查是否已经在登录页面
      if (!this.contextPage.url().includes('kuaishou.com')) {
        await this.contextPage.goto('https://www.kuaishou.com', { waitUntil: 'domcontentloaded' });
      }
      
      // 查找登录按钮并点击 - 使用简单的文本内容选择器
      const loginButtonSelector = 'p:has-text("登录")';
      const loginButton = await this.contextPage.$(loginButtonSelector);
      if (loginButton) {
        console.log('找到登录按钮，点击...');
        await loginButton.click();
        await this.contextPage.waitForTimeout(2000);
      } else {
        // 尝试直接打开登录页面
        console.log('未找到登录按钮，尝试直接访问登录页面...');
        await this.contextPage.goto('https://www.kuaishou.com/login', { waitUntil: 'domcontentloaded' });
      }
      
      // 等待二维码出现
      const qrcodeSelector = '.qrcode-img img';
      try {
        console.log('等待二维码出现...');
        await this.contextPage.waitForSelector(qrcodeSelector, { timeout: 30000 });
        
        // 截图并保存二维码图片
        const qrcodeElement = await this.contextPage.$(qrcodeSelector);
        if (qrcodeElement) {
          await qrcodeElement.screenshot({ path: qrcodePath });
          console.log(`二维码已保存到: ${qrcodePath}`);
          
          // 从图片中识别二维码内容
          const qrcodeContent = await this.readQRCodeFromImage(qrcodePath);
          
          if (qrcodeContent) {
            console.log('\n请使用快手App扫描以下二维码登录：');
            // 使用识别出的内容生成终端二维码
            qrcodeTerminal.generate(qrcodeContent, { small: true });
            console.log(`\n二维码内容：${qrcodeContent}`);
          } else {
            console.log(`无法从图片识别二维码内容，请直接打开保存的图片: ${qrcodePath}`);
          }
          
          console.log('请在60秒内完成扫码登录\n');
          
          // 检查登录状态
          let loginSuccess = false;
          const maxAttempts = 60; // 最多尝试60次，每次等待1秒，总共60秒
          for (let i = 0; i < maxAttempts; i++) {
            // 检查cookies中是否包含登录凭证
            const cookies = await this.browserContext.cookies();
            const hasLoginCookies = cookies.some(cookie => 
              (cookie.name === 'userId' || cookie.name === 'passToken' || cookie.name === 'kuaishou.web.cp.api_st') && cookie.value
            );
            
            if (hasLoginCookies) {
              loginSuccess = true;
              console.log('登录成功，检测到登录cookies');
              break;
            }
            
            console.log(`等待登录中... (${i+1}/${maxAttempts})`);
            await this.contextPage.waitForTimeout(1000);
          }
          
          if (!loginSuccess) {
            console.log('登录超时或取消，请稍后重试');
            return false;
          }
          
          // 登录成功后，等待重定向
          console.log('登录成功，等待页面跳转...');
          await this.contextPage.waitForTimeout(5000);
          
          return true;
        } else {
          console.log('找到二维码元素，但无法截取图片');
          return false;
        }
      } catch (error) {
        console.error('等待二维码出现超时:', error.message);
        
        // 尝试查看页面内容，帮助调试
        console.log('当前页面URL:', this.contextPage.url());
        const pageContent = await this.contextPage.content();
        console.log('页面内容片段:', pageContent.substring(0, 500) + '...');
        
        return false;
      }
    } catch (error) {
      console.error('二维码登录过程出错:', error);
      return false;
    }
  }
  
  /**
   * 从图片中识别二维码内容
   * @param {string} imagePath - 图片路径
   * @returns {Promise<string|null>} 识别到的二维码内容
   */
  async readQRCodeFromImage(imagePath) {
    try {
      console.log(`尝试从图片识别二维码: ${imagePath}`);
      
      // 读取图片
      const image = await Jimp.read(imagePath);
      const { width, height } = image.bitmap;
      
      // 获取图片数据
      const imageData = {
        data: new Uint8ClampedArray(image.bitmap.data),
        width,
        height
      };
      
      // 识别二维码
      const qrCode = jsQR(imageData.data, width, height);
      
      if (qrCode) {
        console.log('成功识别二维码内容');
        return qrCode.data;
      } else {
        console.log('未能识别出二维码内容');
        return null;
      }
    } catch (error) {
      console.error('二维码识别出错:', error);
      return null;
    }
  }

  /**
   * 更新客户端cookies
   */
  async updateClientCookies() {
    try {
      console.log('更新客户端cookies...');
      
      // 获取浏览器cookies
      const cookies = await this.browserContext.cookies();
      
      // 创建cookie对象和字符串
      const cookieObj = {};
      cookies.forEach(cookie => {
        cookieObj[cookie.name] = cookie.value;
      });
      
      // 构建cookie字符串
      const cookieStr = Object.entries(cookieObj)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
      
      // 更新客户端cookies
      this.ksClient.updateCookies(cookieObj, cookieStr);
      
      console.log('客户端cookies更新成功');
    } catch (error) {
      console.error('更新客户端cookies失败:', error);
      throw error;
    }
  }

  /**
   * 搜索关键词
   */
  async searchKeywords() {
    console.log('开始搜索关键词...');
    const keywords = this.config.search_keywords || ['搞笑', '宠物'];
    
    // 创建保存目录
    const savePath = path.join(this.dataRootDir, 'kuaishou', 'json');
    await utils.ensureDir(savePath);
    
    // 获取当前日期
    const today = new Date().toISOString().split('T')[0];
    
    // 所有视频数据
    let allVideos = [];
    
    // 遍历关键词搜索
    for (const keyword of keywords) {
      console.log(`搜索关键词: ${keyword}`);
      const videos = await this.searchVideosForKeyword(keyword);
      allVideos = allVideos.concat(videos);
      
      // 每个关键词之间等待一段时间
      await utils.sleep(2000, 5000);
    }
    
    // 保存所有视频数据
    if (allVideos.length > 0) {
      const saveFilePath = path.join(savePath, `search_contents_${today}.json`);
      await utils.saveToJson(saveFilePath, allVideos);
      console.log(`共保存了 ${allVideos.length} 个视频数据到 ${saveFilePath}`);
    } else {
      console.log('没有找到任何视频数据');
    }
  }

  /**
   * 搜索指定关键词的视频
   * @param {string} keyword 搜索关键词
   * @returns {Promise<Array>} 视频列表
   */
  async searchVideosForKeyword(keyword) {
    console.log(`搜索关键词: ${keyword}`);
    
    try {
      if (!this.ksClient) {
        await this.createKsClient();
      }
      
      // 创建调试目录
      await utils.ensureDir(this.tempDir);
      const debugPath = path.join(this.tempDir, 'search_debug');
      await utils.ensureDir(debugPath);
      
      let page = 1;
      let hasMore = true;
      const videos = [];
      
      while (hasMore && page <= (this.config.max_pages || 3)) {
        try {
          console.log(`正在获取第 ${page} 页`);
          await utils.sleep(1000, 2000);
          
          const searchResult = await this.ksClient.searchVideos(keyword, page);
          
          if (!searchResult) {
            console.log(`第 ${page} 页获取失败`);
            break;
          }
          
          // 调试输出
          console.log('搜索结果数据结构:', JSON.stringify(Object.keys(searchResult)));
          
          if (!searchResult.visionSearchPhoto || !searchResult.visionSearchPhoto.feeds) {
            console.log(`第 ${page} 页没有结果或返回数据格式异常`);
            
            // 检查是否有其他路径的数据
            if (searchResult.visionSearchPhoto) {
              console.log('visionSearchPhoto可用字段:', JSON.stringify(Object.keys(searchResult.visionSearchPhoto)));
            }
            
            break;
          }
          
          const feeds = searchResult.visionSearchPhoto.feeds;
          console.log(`获取到 ${feeds.length} 个视频`);
          
          for (const feed of feeds) {
            if (!feed.photo || !feed.photo.id) continue;
            
            const photo = feed.photo;
            const user = feed.author;
            
            const videoData = {
              video_id: photo.id,
              video_type: "1",
              title: photo.caption || "",
              desc: photo.caption || "",
              create_time: photo.timestamp,
              user_id: user ? user.id : "",
              nickname: user ? user.name : "",
              avatar: user && user.headerUrls && user.headerUrls.length > 0 ? user.headerUrls[0].url : (user ? user.headerUrl : ""),
              liked_count: photo.likeCount || "0",
              viewd_count: photo.viewCount || "0",
              last_modify_ts: Date.now(),
              video_url: `https://www.kuaishou.com/short-video/${photo.id}`,
              video_cover_url: photo.coverUrl || "",
              video_play_url: photo.photoUrl || "",
              source_keyword: keyword
            };
            
            videos.push(videoData);
          }
          
          // 检查是否有下一页
          const pcursor = searchResult.visionSearchPhoto.pcursor;
          if (!pcursor || pcursor === "no_more") {
            hasMore = false;
            console.log("没有更多数据了");
          } else {
            page++;
          }
        } catch (error) {
          console.error(`搜索页 ${page} 出错:`, error);
          break;
        }
      }
      
      console.log(`关键词 ${keyword} 共获取到 ${videos.length} 个视频`);
      
      // 如果有搜索结果，保存示例数据用于调试
      if (videos.length > 0) {
        await utils.saveToJson(path.join(debugPath, `${keyword}_sample.json`), videos.slice(0, 3));
      }
      
      return videos;
    } catch (error) {
      console.error(`搜索关键词 ${keyword} 失败:`, error);
      return [];
    }
  }

  /**
   * 搜索模式
   */
  async search() {
    console.log('使用搜索模式爬取');
    
    if (!this.config.search_keywords || this.config.search_keywords.length === 0) {
      console.error('搜索关键词为空，请检查配置');
      return;
    }
    
    // 为每个关键词创建目录
    for (const keyword of this.config.search_keywords) {
      console.log(`开始搜索关键词: ${keyword}`);
      
      const savePath = path.resolve(this.dataRootDir, 'search', keyword);
      await utils.ensureDir(savePath);
      
      // 搜索视频
      let page = 1;
      let hasMore = true;
      const videos = [];
      
      while (hasMore && page <= (this.config.max_pages || 3)) {
        try {
          console.log(`正在获取第 ${page} 页`);
          await utils.sleep(1000, 2000);
          
          const searchResult = await this.ksClient.searchVideos(keyword, page);
          
          if (!searchResult || !searchResult.visionSearchPhoto || !searchResult.visionSearchPhoto.feeds) {
            console.log(`第 ${page} 页没有结果或返回数据格式异常`);
            break;
          }
          
          const feeds = searchResult.visionSearchPhoto.feeds;
          console.log(`获取到 ${feeds.length} 个视频`);
          
          for (const feed of feeds) {
            if (!feed.photo || !feed.photo.id) continue;
            
            const photo = feed.photo;
            const user = feed.author;
            
            const videoData = {
              video_id: photo.id,
              video_type: "1",
              title: photo.caption || "",
              desc: photo.caption || "",
              create_time: photo.timestamp,
              user_id: user ? user.id : "",
              nickname: user ? user.name : "",
              avatar: user && user.headerUrls && user.headerUrls.length > 0 ? user.headerUrls[0].url : (user ? user.headerUrl : ""),
              liked_count: photo.likeCount || "0",
              viewd_count: photo.viewCount || "0",
              last_modify_ts: Date.now(),
              video_url: `https://www.kuaishou.com/short-video/${photo.id}`,
              video_cover_url: photo.coverUrl || "",
              video_play_url: photo.photoUrl || "",
              source_keyword: keyword
            };
            
            videos.push(videoData);
          }
          
          // 检查是否有下一页
          const pcursor = searchResult.visionSearchPhoto.pcursor;
          if (!pcursor || pcursor === "no_more") {
            hasMore = false;
            console.log("没有更多数据了");
          } else {
            page++;
          }
        } catch (error) {
          console.error(`搜索页 ${page} 出错:`, error);
          hasMore = false;
        }
      }
      
      console.log(`关键词 ${keyword} 共获取到 ${videos.length} 个视频`);
      
      // 保存视频列表
      const videoListPath = path.join(savePath, 'video_list.json');
      await utils.saveToJson(videoListPath, videos);
      
      // 如果配置了爬取评论，则获取评论
      if (this.config.get_comments && videos.length > 0) {
        const videoIds = videos.map(v => v.video_id);
        await this.batchGetVideoComments(videoIds, savePath);
      }
    }
  }

  /**
   * 详情模式：获取指定的视频
   */
  async getSpecifiedVideos() {
    console.log('使用详情模式爬取');
    
    if (!this.config.video_id_list || this.config.video_id_list.length === 0) {
      console.error('视频ID列表为空，请检查配置');
      return;
    }
    
    const savePath = path.join(this.dataRootDir, 'detail');
    await utils.ensureDir(savePath);
    
    const videoIds = this.config.video_id_list;
    console.log(`准备获取 ${videoIds.length} 个视频的详情`);
    
    // 并发获取视频详情
    const limit = pLimit(this.concurrencyLimit);
    const videoInfoPromises = videoIds.map(videoId => {
      return limit(() => this.getVideoInfoTask(videoId));
    });
    
    const videoInfos = await Promise.all(videoInfoPromises);
    const validVideoInfos = videoInfos.filter(Boolean);
    
    console.log(`成功获取 ${validVideoInfos.length} 个视频的详情`);
    
    // 保存视频详情
    const videoInfosPath = path.join(savePath, 'video_infos.json');
    await utils.saveToJson(videoInfosPath, validVideoInfos);
    
    // 如果配置了爬取评论，则获取评论
    if (this.config.get_comments) {
      await this.batchGetVideoComments(videoIds, savePath);
    }
  }

  /**
   * 获取单个视频详情的任务
   * @param {string} videoId 视频ID
   * @returns {Promise<object|null>} 视频详情
   */
  async getVideoInfoTask(videoId) {
    try {
      console.log(`获取视频详情: ${videoId}`);
      await utils.sleep(500, 1500);
      
      const result = await this.ksClient.getVideoInfo(videoId);
      
      if (!result.data || !result.data.photoDetail) {
        console.log(`视频 ${videoId} 获取失败或不存在`);
        return null;
      }
      
      const photoDetail = result.data.photoDetail;
      const photo = photoDetail.photo;
      const user = photoDetail.user;
      
      return {
        video_id: photo.id,
        author_id: user.id,
        author_name: user.name,
        caption: photo.caption,
        cover_url: photo.coverUrl,
        play_url: photo.photoUrl,
        like_count: photo.likeCount,
        comment_count: photo.commentCount,
        view_count: photo.viewCount,
        duration: photo.duration,
        timestamp: photo.timestamp,
        create_time: moment(photo.timestamp).format('YYYY-MM-DD HH:mm:ss')
      };
    } catch (error) {
      console.error(`获取视频 ${videoId} 详情出错:`, error);
      return null;
    }
  }

  /**
   * 批量获取视频评论
   * @param {string[]} videoIdList 视频ID列表
   * @param {string} savePath 保存路径
   */
  async batchGetVideoComments(videoIdList, savePath) {
    console.log(`准备获取 ${videoIdList.length} 个视频的评论`);
    
    const commentsDir = path.join(savePath, 'comments');
    await utils.ensureDir(commentsDir);
    
    const limit = pLimit(this.concurrencyLimit);
    const commentPromises = videoIdList.map(videoId => {
      return limit(() => this.getComments(videoId, commentsDir));
    });
    
    await Promise.all(commentPromises);
    console.log('评论获取完成');
  }

  /**
   * 获取单个视频的评论
   * @param {string} videoId 视频ID
   * @param {string} savePath 保存路径
   */
  async getComments(videoId, savePath) {
    try {
      console.log(`获取视频评论: ${videoId}`);
      await utils.sleep(1000, 2000);
      
      let pcursor = '';
      let allComments = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore && page <= (this.config.max_comment_pages || 3)) {
        try {
          const result = await this.ksClient.getVideoComments(videoId, pcursor);
          
          if (!result.data || !result.data.visionCommentList) {
            console.log(`视频 ${videoId} 的评论获取失败或不存在`);
            break;
          }
          
          const commentList = result.data.visionCommentList;
          pcursor = commentList.pcursor;
          
          if (!commentList.rootComments || commentList.rootComments.length === 0) {
            console.log(`视频 ${videoId} 没有更多评论`);
            hasMore = false;
            break;
          }
          
          // 处理当前页评论
          const comments = commentList.rootComments.map(comment => {
            // 提取子评论
            const subComments = comment.subComments ? comment.subComments.map(sub => ({
              comment_id: sub.commentId,
              author_id: sub.authorId,
              author_name: sub.authorName,
              content: sub.content,
              timestamp: sub.timestamp,
              create_time: moment(sub.timestamp).format('YYYY-MM-DD HH:mm:ss'),
              liked_count: sub.likedCount
            })) : [];
            
            // 返回主评论
            return {
              comment_id: comment.commentId,
              content: comment.content,
              author_id: comment.authorId,
              author_name: comment.authorName,
              avatar: comment.headurl,
              timestamp: comment.timestamp,
              like_count: comment.likedCount,
              sub_comment_count: comment.subCommentCount,
              sub_comments: subComments
            };
          });
          
          allComments = [...allComments, ...comments];
          
          // 检查是否有更多评论
          if (pcursor === '') {
            hasMore = false;
          } else {
            page++;
            await utils.sleep(1000, 2000);
          }
        } catch (error) {
          console.error(`获取视频 ${videoId} 第 ${page} 页评论出错:`, error);
          if (error.message.includes('rate limit') || error.message.includes('forbidden')) {
            console.log('可能被限制，等待一段时间...');
            await utils.sleep(10000, 20000);
          } else {
            hasMore = false;
          }
        }
      }
      
      console.log(`视频 ${videoId} 共获取到 ${allComments.length} 条评论`);
      
      // 保存评论
      const commentFilePath = path.join(savePath, `${videoId}.json`);
      await utils.saveToJson(commentFilePath, {
        video_id: videoId,
        comment_count: allComments.length,
        comments: allComments
      });
    } catch (error) {
      console.error(`获取视频 ${videoId} 评论出错:`, error);
    }
  }

  /**
   * 创建快手客户端
   * @returns {Promise<KuaiShouClient>} 快手客户端实例
   */
  async createKsClient() {
    try {
      console.log('创建快手客户端...');
      
      // 获取浏览器cookies
      const cookies = await this.browserContext.cookies();
      
      // 创建cookie对象
      const cookieObj = {};
      cookies.forEach(cookie => {
        cookieObj[cookie.name] = cookie.value;
      });
      
      // 创建客户端实例
      const KuaiShouClient = require('./client');
      // 检查代理配置是否有效
      const proxyConfig = this.config.proxy && typeof this.config.proxy === 'object' && Object.keys(this.config.proxy).length > 0 
                         ? this.config.proxy 
                         : null;
      console.log('代理配置:', proxyConfig ? '已配置' : '未配置');
      const client = new KuaiShouClient(cookieObj, this.userAgent, proxyConfig);
      
      console.log('快手客户端创建成功');
      return client;
    } catch (error) {
      console.error('创建快手客户端失败:', error);
      throw error;
    }
  }

  /**
   * 启动浏览器
   * @param {object} chromiumBrowser Playwright的chromium对象
   * @param {object} playwrightProxy 代理配置
   * @param {string} userAgent 用户代理
   * @param {boolean} headless 是否无头模式
   * @returns {Promise<object>} 浏览器上下文
   */
  async launchBrowser() {
    try {
      // 导入必要模块
      const { chromium } = require('playwright');
      const path = require('path');
      const fs = require('fs').promises;
      
      console.log('正在启动浏览器...');
      
      // 浏览器数据目录
      const browserDataDir = path.resolve(this.dataRootDir, '..', 'browser_data');
      await utils.ensureDir(browserDataDir);
      
      // 尝试加载保存的cookies
      const cookiesPath = path.join(this.dataRootDir, 'cookies.json');
      let savedCookies = [];
      try {
        if (await utils.fileExists(cookiesPath)) {
          const cookiesData = await fs.readFile(cookiesPath, 'utf8');
          savedCookies = JSON.parse(cookiesData);
          console.log('找到保存的cookies，将尝试恢复登录状态');
        }
      } catch (e) {
        console.log('加载cookies失败:', e.message);
        savedCookies = [];
      }
      
      // 用户数据目录
      const timestamp = Date.now();
      const userDataDir = path.join(this.browserDataDir, `kuaishou_user_data_dir_${timestamp}`);
      
      // 确保目录存在
      await utils.ensureDir(userDataDir);
      
      // 随机生成一个真实的用户代理
      this.userAgent = utils.getUserAgent();
      console.log('使用用户代理:', this.userAgent);
      
      // 浏览器上下文选项
      const contextOptions = {
        headless: false, // 强制使用非无头模式
        userAgent: this.userAgent,
        viewport: {
          width: 1280 + Math.floor(Math.random() * 100),
          height: 800 + Math.floor(Math.random() * 100)
        },
        deviceScaleFactor: 1,
        bypassCSP: true,
        ignoreHTTPSErrors: true,
        javaScriptEnabled: true,
        hasTouch: false,
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        geolocation: { longitude: 116.4, latitude: 39.9 },
        permissions: ['geolocation'],
        colorScheme: 'light',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-notifications', 
          '--disable-popup-blocking'
        ]
      };
      
      const playwrightProxy = this.config.proxy;
      if (playwrightProxy) {
        contextOptions.proxy = playwrightProxy;
      }
      
      console.log('正在启动浏览器...');
      
      // 启动持久化浏览器上下文
      const context = await chromium.launchPersistentContext(userDataDir, contextOptions);
      
      // 不需要单独启动browser了，因为launchPersistentContext已经包含了browser
      this.browser = context.browser();
      
      // 加载反检测脚本
      await context.addInitScript({
        path: path.join(__dirname, '../../utils/stealth.min.js')
      });
      
      // 创建新页面
      this.contextPage = await context.newPage();
      
      console.log('浏览器启动成功');
      
      // 如果有保存的cookies，尝试恢复登录状态
      if (savedCookies && savedCookies.length > 0) {
        try {
          console.log(`正在加载${savedCookies.length}个保存的cookies，尝试恢复登录状态...`);
          await context.addCookies(savedCookies);
          console.log('cookies加载完成');
        } catch (e) {
          console.error('加载cookies失败:', e.message);
        }
      }
      
      return context;
    } catch (error) {
      console.error('浏览器启动失败:', error);
      throw error;
    }
  }

  /**
   * 访问快手首页
   */
  async visitHomePage() {
    try {
      console.log('尝试访问快手首页...');
      
      // 确保页面已经准备好
      if (!this.contextPage || this.contextPage.isClosed()) {
        console.log('页面已关闭，创建新页面...');
        this.contextPage = await this.browserContext.newPage();
      }
      
      // 随机延迟，模拟真实用户行为
      await utils.sleep(1000, 2000);
      
      // 访问首页
      await this.contextPage.goto(this.indexUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      // 检查是否出现安全验证或滑块验证
      await this.checkSecurityVerification();

      // 随机滚动页面，模拟正常用户浏览行为
      await this._randomScrollPage();
      
      // 模拟一些用户行为，移动鼠标等
      await this._simulateUserBehavior();
      
      console.log('快手首页访问完成');
      
      return this.contextPage;
    } catch (error) {
      console.log('访问快手首页过程中出现错误，但将继续执行:', error);
      // 返回当前页面，即使出错也继续执行
      return this.contextPage;
    }
  }
  
  /**
   * 检查页面是否出现安全验证
   */
  async checkSecurityVerification() {
    try {
      console.log('检查是否出现安全验证...');
      
      // 等待页面完全加载
      await utils.sleep(2000);
      
      // 检查是否有安全验证标题
      const securityTitle = await this.contextPage.locator('text=请完成安全验证').count();
      if (securityTitle > 0) {
        console.log('检测到安全验证，需要手动处理！');
        
        // 检查是否是滑块验证
        const slider = await this.contextPage.locator('.slider-move-bar, .drag-button').count();
        if (slider > 0) {
          console.log('检测到滑块验证，请在浏览器中手动完成验证');
        } else {
          // 检查是否是拼图验证
          const puzzle = await this.contextPage.locator('.puzzle-container').count();
          if (puzzle > 0) {
            console.log('检测到拼图验证，请在浏览器中手动完成验证');
          } else {
            console.log('检测到未知类型的安全验证，请在浏览器中手动处理');
          }
        }
        
        // 保存验证页面截图以便查看
        const tempDir = path.join(process.cwd(), 'temp');
        await utils.ensureDir(tempDir);
        const screenshotPath = path.join(tempDir, `security_verification_${Date.now()}.png`);
        await this.contextPage.screenshot({ path: screenshotPath });
        console.log(`安全验证页面截图已保存到: ${screenshotPath}`);
        
        // 等待用户手动完成验证 (60秒超时)
        console.log('等待用户手动完成验证...');
        const maxWaitTime = 60; // 秒
        let waited = 0;
        
        while (waited < maxWaitTime) {
          // 检查验证是否已完成
          const stillHasVerification = await this.contextPage.locator('text=请完成安全验证').count() > 0;
          if (!stillHasVerification) {
            console.log('验证已完成，继续进行操作');
            break;
          }
          
          // 等待5秒再检查
          await utils.sleep(5000);
          waited += 5;
          console.log(`已等待 ${waited} 秒，继续等待用户完成验证...`);
        }
        
        if (waited >= maxWaitTime) {
          console.log('验证等待超时，可能需要重新启动爬虫');
        }
      } else {
        console.log('未检测到安全验证，继续进行操作');
      }
    } catch (error) {
      console.error('检查安全验证时出错:', error);
    }
  }
  
  /**
   * 模拟随机页面滚动
   * @private
   */
  async _randomScrollPage() {
    try {
      const scrolls = Math.floor(Math.random() * 3) + 2; // 2-4次滚动
      
      for (let i = 0; i < scrolls; i++) {
        // 随机滚动距离
        const scrollY = Math.floor(Math.random() * 300) + 100;
        await this.contextPage.evaluate((scrollY) => {
          window.scrollBy(0, scrollY);
        }, scrollY);
        
        // 随机等待
        await utils.sleep(800, 2000);
      }
    } catch (error) {
      console.log('模拟滚动出错:', error);
    }
  }
  
  /**
   * 模拟用户行为
   * @private
   */
  async _simulateUserBehavior() {
    try {
      // 随机移动鼠标
      const boxWidth = Math.floor(Math.random() * 500) + 100;
      const boxHeight = Math.floor(Math.random() * 300) + 100;
      
      await this.contextPage.mouse.move(boxWidth, boxHeight, { steps: 5 });
      await utils.sleep(500, 1500);
      
      // 随机点击一个安全区域（如果有明确的安全区域可以指定）
      const safeAreaSelector = '.logo-wrap';
      const safeArea = await this.contextPage.$(safeAreaSelector);
      if (safeArea) {
        const box = await safeArea.boundingBox();
        if (box) {
          await this.contextPage.mouse.click(
            box.x + box.width / 2, 
            box.y + box.height / 2
          );
        }
      }
      
      await utils.sleep(1000, 2000);
    } catch (error) {
      console.log('模拟用户行为出错:', error);
    }
  }

  /**
   * 创作者模式：获取创作者的视频
   */
  async getCreatorsAndVideos() {
    console.log('使用创作者模式爬取');
    
    if (!this.config.creator_id_list || this.config.creator_id_list.length === 0) {
      console.error('创作者ID列表为空，请检查配置');
      return;
    }
    
    const creatorIds = this.config.creator_id_list;
    
    for (const creatorId of creatorIds) {
      console.log(`获取创作者 ${creatorId} 的信息和视频`);
      
      try {
        // 获取创作者信息
        const profileResult = await this.ksClient.getUserProfile(creatorId);
        
        if (!profileResult.data || !profileResult.data.userProfile) {
          console.log(`创作者 ${creatorId} 不存在或获取失败`);
          continue;
        }
        
        const userProfile = profileResult.data.userProfile;
        const user = userProfile.profile.user;
        
        const creatorInfo = {
          creator_id: user.id,
          name: user.name,
          gender: userProfile.profile.gender,
          avatar: user.avatar,
          fans_count: userProfile.ownerCount?.fan || 0,
          follow_count: userProfile.ownerCount?.follow || 0,
          photo_count: userProfile.ownerCount?.photo || 0
        };
        
        // 为创作者创建目录
        const savePath = path.resolve(this.dataRootDir, 'creator', creatorId);
        await utils.ensureDir(savePath);
        
        // 保存创作者信息
        const creatorInfoPath = path.join(savePath, 'creator_info.json');
        await utils.saveToJson(creatorInfoPath, creatorInfo);
        
        // 获取创作者视频
        let pcursor = '';
        let hasMore = true;
        let page = 1;
        let allVideos = [];
        
        while (hasMore && page <= (this.config.max_pages || 3)) {
          await utils.sleep(1000, 2000);
          
          const feedsResult = await this.ksClient.getUserPhotos(creatorId, pcursor);
          
          if (!feedsResult.data || !feedsResult.data.publicFeeds) {
            console.log(`创作者 ${creatorId} 的视频获取失败`);
            break;
          }
          
          const feeds = feedsResult.data.publicFeeds;
          pcursor = feeds.pcursor;
          
          if (!feeds.feeds || feeds.feeds.length === 0) {
            console.log(`创作者 ${creatorId} 没有更多视频`);
            hasMore = false;
            break;
          }
          
          // 提取视频信息
          const videos = feeds.feeds.map(feed => {
            const photo = feed.photo;
            return {
              video_id: photo.id,
              caption: photo.caption,
              cover_url: photo.coverUrl,
              play_url: photo.photoUrl,
              like_count: photo.likeCount,
              comment_count: photo.commentCount,
              view_count: photo.viewCount,
              duration: photo.duration,
              timestamp: photo.timestamp,
              create_time: moment(photo.timestamp).format('YYYY-MM-DD HH:mm:ss')
            };
          }).filter(Boolean);
          
          allVideos = [...allVideos, ...videos];
          
          // 检查是否有更多视频
          if (pcursor === '') {
            hasMore = false;
          } else {
            page++;
          }
        }
        
        console.log(`创作者 ${creatorId} 共获取到 ${allVideos.length} 个视频`);
        
        // 保存视频列表
        const videoListPath = path.join(savePath, 'video_list.json');
        await utils.saveToJson(videoListPath, allVideos);
        
        // 如果配置了爬取视频详情，则获取详情
        if (this.config.get_video_detail && allVideos.length > 0) {
          await this.fetchCreatorVideoDetail(allVideos, savePath);
        }
        
        // 如果配置了爬取评论，则获取评论
        if (this.config.get_comments && allVideos.length > 0) {
          const videoIds = allVideos.map(v => v.video_id);
          await this.batchGetVideoComments(videoIds, savePath);
        }
      } catch (error) {
        console.error(`获取创作者 ${creatorId} 信息出错:`, error);
      }
    }
  }

  /**
   * 获取创作者视频的详细信息
   * @param {object[]} videoList 视频列表
   * @param {string} savePath 保存路径
   */
  async fetchCreatorVideoDetail(videoList, savePath) {
    console.log(`获取 ${videoList.length} 个视频的详情`);
    
    const detailDir = path.join(savePath, 'details');
    await utils.ensureDir(detailDir);
    
    const limit = pLimit(this.concurrencyLimit);
    const videoIds = videoList.map(v => v.video_id);
    
    const detailPromises = videoIds.map(videoId => {
      return limit(async () => {
        const detail = await this.getVideoInfoTask(videoId);
        if (detail) {
          const detailPath = path.join(detailDir, `${videoId}.json`);
          await utils.saveToJson(detailPath, detail);
        }
        return detail;
      });
    });
    
    await Promise.all(detailPromises);
    console.log('视频详情获取完成');
  }

  /**
   * 通过快手号获取快手id
   * @param {string} username 快手号
   * @returns {Promise<string|null>} 成功返回快手id，失败返回null
   */
  async getKuaishouIdByUsername(username) {
    try {
      console.log(`正在获取快手号 ${username} 对应的快手ID...`);
      
      // 如果已经有browserContext，则使用现有的，否则才创建新的
      if (!this.browserContext || !this.browser) {
        console.log('浏览器尚未启动，自动启动爬虫...');
        // 检查是否已经有爬虫实例在运行
        if (global.runningCrawler) {
          console.log('检测到全局爬虫实例，使用现有实例');
          this.browser = global.runningCrawler.browser;
          this.browserContext = global.runningCrawler.browserContext;
          this.contextPage = global.runningCrawler.contextPage;
          this.ksClient = global.runningCrawler.ksClient;
        } else {
          await this.start();
          // 将当前爬虫实例保存到全局变量
          global.runningCrawler = this;
          console.log('爬虫启动完成，继续获取快手ID');
        }
      } else {
        console.log('使用现有浏览器实例');
      }
      
      if (!this.contextPage || this.contextPage.isClosed()) {
        console.log('创建新页面...');
        this.contextPage = await this.browserContext.newPage();
      }
      
      // 访问作者搜索页面
      const searchUrl = `https://www.kuaishou.com/search/author?searchKey=${encodeURIComponent(username)}`;
      console.log(`访问作者搜索页面: ${searchUrl}`);
      await this.contextPage.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      
      // 等待页面加载
      await this.contextPage.waitForLoadState('domcontentloaded');
      await this.contextPage.waitForTimeout(2000);  // 多等待一会，确保内容加载完成
      
      // 截图保存，用于调试
      const beforeScreenshotPath = path.join(this.tempDir, `search_${username}_${Date.now()}.png`);
      await utils.ensureDir(this.tempDir);
      await this.contextPage.screenshot({ path: beforeScreenshotPath });
      console.log(`搜索页面截图已保存至: ${beforeScreenshotPath}`);
      
      // 获取首个用户卡片的位置信息
      console.log(`获取首个用户卡片位置信息...`);
      const cardBounds = await this.contextPage.evaluate(() => {
        const cards = document.querySelectorAll('.container.card-item');
        if (!cards || cards.length === 0) return null;
        
        const firstCard = cards[0];
        const rect = firstCard.getBoundingClientRect();
        
        // 获取用户名, 可能用于调试
        const nameElement = firstCard.querySelector('.detail-user-name .title');
        const name = nameElement ? nameElement.textContent.trim() : 'unknown';
        
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          userName: name,
          cardCount: cards.length
        };
      });
      
      if (!cardBounds) {
        console.log(`未找到任何用户卡片`);
        return null;
      }
      
      console.log(`找到用户卡片: ${JSON.stringify(cardBounds)}`);
      
      // 在卡片区域内随机位置点击，同时监听新页面打开事件
      const x = cardBounds.x + (cardBounds.width * 0.5) + (Math.random() * 20 - 10);
      const y = cardBounds.y + (cardBounds.height * 0.3) + (Math.random() * 20 - 10);
      
      console.log(`准备在位置 (${x}, ${y}) 进行点击...`);
      
      // 监听新页面打开事件
      console.log(`设置新页面打开监听...`);
      const pagePromise = this.browserContext.waitForEvent('page', { timeout: 15000 }).catch(e => {
        console.log(`新页面监听超时: ${e.message}`);
        return null;
      });
      
      // 点击区域
      console.log(`点击位置 (${x}, ${y})...`);
      await this.contextPage.mouse.click(x, y);
      
      // 等待新页面
      console.log(`等待新页面打开...`);
      const newPage = await pagePromise;
      
      if (newPage) {
        console.log(`新页面已打开，等待加载完成...`);
        
        // 等待新页面加载
        await newPage.waitForLoadState('networkidle').catch(e => {
          console.log(`新页面加载超时: ${e.message}`);
        });
        
        // 获取新页面URL
        const newUrl = newPage.url();
        console.log(`新页面URL: ${newUrl}`);
        
        // 截图保存
        const newPageScreenshotPath = path.join(this.tempDir, `profile_${username}_${Date.now()}.png`);
        await newPage.screenshot({ path: newPageScreenshotPath }).catch(e => {
          console.log(`新页面截图失败: ${e.message}`);
        });
        console.log(`新页面截图已保存至: ${newPageScreenshotPath}`);
        
        // 从URL中提取用户ID
        const profileMatch = newUrl.match(/\/profile\/([^?/]+)/);
        if (profileMatch && profileMatch[1]) {
          const userIdFromUrl = profileMatch[1];
          console.log(`从URL中提取到用户ID: ${userIdFromUrl}`);
          
          // 关闭新页面
          await newPage.close().catch(e => {
            console.log(`关闭新页面失败: ${e.message}`);
          });
          
          return userIdFromUrl;
        }
        
        // 如果URL不包含用户ID，尝试从页面内容中提取
        console.log(`URL中未找到用户ID，尝试从页面内容中提取...`);
        const userId = await newPage.evaluate(() => {
          const html = document.documentElement.outerHTML;
          
          // 尝试从各种模式中提取ID
          const patterns = [
            /\/profile\/([a-zA-Z0-9_\-]+)/,
            /"userId":"([a-zA-Z0-9_\-]+)"/,
            /"authorId":"([a-zA-Z0-9_\-]+)"/,
            /"id":"([a-zA-Z0-9_\-]+)"/
          ];
          
          for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
              return match[1];
            }
          }
          
          return null;
        }).catch(e => {
          console.log(`从新页面提取内容失败: ${e.message}`);
          return null;
        });
        
        // 关闭新页面
        await newPage.close().catch(e => {
          console.log(`关闭新页面失败: ${e.message}`);
        });
        
        if (userId) {
          console.log(`从新页面内容中提取到用户ID: ${userId}`);
          return userId;
        }
      }
      
      // 如果点击第一个位置未成功，尝试点击头像区域
      console.log(`尝试点击用户头像区域...`);
      const avatarBounds = await this.contextPage.evaluate(() => {
        const cards = document.querySelectorAll('.container.card-item');
        if (!cards || cards.length === 0) return null;
        
        const firstCard = cards[0];
        const avatar = firstCard.querySelector('.avatar-img');
        if (!avatar) return null;
        
        const rect = avatar.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        };
      });
      
      if (avatarBounds) {
        console.log(`找到头像元素: ${JSON.stringify(avatarBounds)}`);
        
        const avatarX = avatarBounds.x + (avatarBounds.width / 2);
        const avatarY = avatarBounds.y + (avatarBounds.height / 2);
        
        // 监听新页面打开事件
        console.log(`设置头像点击的新页面监听...`);
        const avatarPagePromise = this.browserContext.waitForEvent('page', { timeout: 15000 }).catch(e => {
          console.log(`头像点击新页面监听超时: ${e.message}`);
          return null;
        });
        
        console.log(`点击头像位置 (${avatarX}, ${avatarY})...`);
        await this.contextPage.mouse.click(avatarX, avatarY);
        
        // 等待新页面
        console.log(`等待头像点击后的新页面打开...`);
        const avatarNewPage = await avatarPagePromise;
        
        if (avatarNewPage) {
          console.log(`头像点击后新页面已打开，等待加载完成...`);
          
          // 等待新页面加载
          await avatarNewPage.waitForLoadState('networkidle').catch(e => {
            console.log(`头像新页面加载超时: ${e.message}`);
          });
          
          // 获取新页面URL
          const avatarUrl = avatarNewPage.url();
          console.log(`头像点击后新页面URL: ${avatarUrl}`);
          
          // 截图保存
          const avatarScreenshotPath = path.join(this.tempDir, `avatar_profile_${username}_${Date.now()}.png`);
          await avatarNewPage.screenshot({ path: avatarScreenshotPath }).catch(e => {
            console.log(`头像新页面截图失败: ${e.message}`);
          });
          console.log(`头像点击新页面截图已保存至: ${avatarScreenshotPath}`);
          
          // 从URL中提取用户ID
          const profileMatch = avatarUrl.match(/\/profile\/([^?/]+)/);
          if (profileMatch && profileMatch[1]) {
            const avatarUserId = profileMatch[1];
            console.log(`从头像点击URL中提取到用户ID: ${avatarUserId}`);
            
            // 关闭新页面
            await avatarNewPage.close().catch(e => {
              console.log(`关闭头像新页面失败: ${e.message}`);
            });
            
            return avatarUserId;
          }
          
          // 关闭新页面
          await avatarNewPage.close().catch(e => {
            console.log(`关闭头像新页面失败: ${e.message}`);
          });
        }
      }
      
      // 如果以上方法都未成功，尝试点击名称区域
      console.log(`尝试点击用户名称区域...`);
      const nameBounds = await this.contextPage.evaluate(() => {
        const nameEl = document.querySelector('.detail-user-name');
        if (!nameEl) return null;
        
        const rect = nameEl.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        };
      });
      
      if (nameBounds) {
        console.log(`找到名称元素: ${JSON.stringify(nameBounds)}`);
        
        const nameX = nameBounds.x + (nameBounds.width / 2);
        const nameY = nameBounds.y + (nameBounds.height / 2);
        
        // 监听新页面打开事件
        console.log(`设置名称点击的新页面监听...`);
        const namePagePromise = this.browserContext.waitForEvent('page', { timeout: 15000 }).catch(e => {
          console.log(`名称点击新页面监听超时: ${e.message}`);
          return null;
        });
        
        console.log(`点击名称位置 (${nameX}, ${nameY})...`);
        await this.contextPage.mouse.click(nameX, nameY);
        
        // 等待新页面
        console.log(`等待名称点击后的新页面打开...`);
        const nameNewPage = await namePagePromise;
        
        if (nameNewPage) {
          console.log(`名称点击后新页面已打开，等待加载完成...`);
          
          // 等待新页面加载
          await nameNewPage.waitForLoadState('networkidle').catch(e => {
            console.log(`名称新页面加载超时: ${e.message}`);
          });
          
          // 获取新页面URL
          const nameUrl = nameNewPage.url();
          console.log(`名称点击后新页面URL: ${nameUrl}`);
          
          // 从URL中提取用户ID
          const profileMatch = nameUrl.match(/\/profile\/([^?/]+)/);
          if (profileMatch && profileMatch[1]) {
            const nameUserId = profileMatch[1];
            console.log(`从名称点击URL中提取到用户ID: ${nameUserId}`);
            
            // 关闭新页面
            await nameNewPage.close().catch(e => {
              console.log(`关闭名称新页面失败: ${e.message}`);
            });
            
            return nameUserId;
          }
          
          // 关闭新页面
          await nameNewPage.close().catch(e => {
            console.log(`关闭名称新页面失败: ${e.message}`);
          });
        }
      }
      
      // 最后尝试从原页面内容中提取用户ID
      console.log(`尝试从原页面内容中提取用户ID...`);
      const originalUserId = await this.contextPage.evaluate(() => {
        const html = document.documentElement.outerHTML;
        
        // 尝试从各种模式中提取ID
        const patterns = [
          /\/profile\/([a-zA-Z0-9_\-]+)/,
          /"userId":"([a-zA-Z0-9_\-]+)"/,
          /"authorId":"([a-zA-Z0-9_\-]+)"/,
          /"id":"([a-zA-Z0-9_\-]+)"/
        ];
        
        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            return match[1];
          }
        }
        
        return null;
      });
      
      if (originalUserId) {
        console.log(`从原页面内容中提取到用户ID: ${originalUserId}`);
        return originalUserId;
      }
      
      console.log(`无法获取快手号 ${username} 对应的快手ID`);
      return null;
    } catch (error) {
      console.error(`获取快手号 ${username} 的快手ID时出错:`, error);
      return null;
    }
  }

  /**
   * 检查给定的字符串是否为有效的快手ID
   * @param {string} id 可能的快手ID
   * @returns {Promise<boolean>} 是否为有效的快手ID
   */
  async isValidKuaishouId(id) {
    console.log(`正在验证 ${id} 是否为有效的快手ID...`);
    
    // 如果输入为空，直接返回false
    if (!id) {
      console.log('输入ID为空，无效');
      return false;
    }
    
    // 从URL中提取ID
    if (id.includes('kuaishou.com/profile/')) {
      const match = id.match(/kuaishou\.com\/profile\/([^?/]+)/);
      if (match && match[1]) {
        id = match[1];
        console.log(`从URL中提取ID: ${id}`);
      }
    }
    
    try {
      // 尝试通过API方式验证（如果已有客户端）
      if (this.ksClient) {
        try {
          console.log(`尝试通过API验证ID: ${id}...`);
          
          // 首先尝试标准方法
          const profileResult = await this.ksClient.getUserProfile(id);
          
          if (profileResult && profileResult.data && profileResult.data.userProfile) {
            console.log(`通过API验证成功，${id} 是有效的快手ID`);
            return true;
          }
          
          // 如果标准方法失败，尝试测试方法
          console.log(`标准API验证失败，尝试通过测试API验证...`);
          const testResult = await this.ksClient.testGetUserProfile(id);
          
          if (testResult && testResult.visionProfile && testResult.visionProfile.result === 1) {
            console.log(`通过测试API验证成功，${id} 是有效的快手ID`);
            return true;
          } else if (testResult && testResult.visionProfile && testResult.visionProfile.result !== 1) {
            console.log(`API验证显示ID无效，错误码: ${testResult.visionProfile.result}`);
            return false;
          }
        } catch (apiError) {
          console.log(`API验证ID时出错: ${apiError.message}`);
          // 出错后继续尝试HTTP方式
        }
      } else {
        console.log('客户端未初始化，跳过API验证，直接使用HTTP请求验证');
      }
      
      // 尝试通过HTTP请求验证
      console.log(`尝试通过HTTP请求验证ID: ${id}...`);
      
      // 创建一个超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
      
      try {
        const response = await fetch(`https://www.kuaishou.com/profile/${id}`, {
          method: 'GET',
          headers: {
            'User-Agent': this.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
          },
          redirect: 'follow',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId); // 清除超时
        
        // 检查响应状态
        if (response.ok) {
          // 检查是否重定向到错误页面
          const finalUrl = response.url;
          if (finalUrl.includes('/error') || finalUrl.includes('/notfound')) {
            console.log(`请求重定向到错误页面: ${finalUrl}，${id} 不是有效的快手ID`);
            return false;
          }
          
          // 尝试读取响应内容检查是否有用户信息
          const html = await response.text();
          
          // 如果页面包含特定的错误信息或空页面标记，则认为ID无效
          if (html.includes('抱歉，页面不存在') || 
              html.includes('用户不存在') || 
              html.includes('not-found') ||
              html.includes('找不到此用户') ||
              html.includes('errorContent')) {
            console.log(`响应内容表明用户不存在，${id} 不是有效的快手ID`);
            return false;
          }
          
          // 检查是否包含用户信息的关键指标
          const hasUserInfoMarkers = 
            html.includes('"userId"') || 
            html.includes('user-info') || 
            html.includes('detail-user-name') ||
            html.includes('"ownerCount"');
            
          if (hasUserInfoMarkers) {
            // 补充验证：检查页面是否包含具体用户内容
            const hasActualContent = 
              html.includes('detail-user-desc') || 
              html.includes('profile-user-name') ||
              (html.includes('user_name') && html.includes('headurl'));
              
            if (hasActualContent) {
              console.log(`响应中包含用户信息标记和实际内容，${id} 是有效的快手ID`);
              return true;
            } else {
              console.log(`响应中包含用户信息标记但缺少实际内容，可能是空白页面，再次验证...`);
              // 这里可以选择性地添加额外的验证步骤
              return false;
            }
          } else {
            console.log(`响应中不包含用户信息标记，${id} 可能不是有效的快手ID`);
            return false;
          }
        } else {
          console.log(`HTTP请求失败，状态码: ${response.status}，${id} 可能不是有效的快手ID`);
          return false;
        }
      } catch (fetchError) {
        clearTimeout(timeoutId); // 清除超时
        
        if (fetchError.name === 'AbortError') {
          console.log(`HTTP请求超时，无法验证ID: ${id}`);
        } else {
          console.log(`HTTP请求出错: ${fetchError.message}`);
        }
        return false;
      }
    } catch (error) {
      console.error(`验证快手ID ${id} 时出错:`, error);
      return false;
    }
  }

  /**
   * 通过快手号获取用户信息
   * @param {string} kuaishouId 快手号
   * @returns {Promise<object>} 用户信息
   */
  async getUserProfile(kuaishouId) {
    console.log(`开始获取快手号为 ${kuaishouId} 的用户信息`);
    
    // 确保有客户端，但避免重复初始化
    if (!this.ksClient) {
      console.log('KuaiShou客户端未初始化，正在初始化...');
      try {
        // 检查是否已有浏览器实例运行
        if (this.browserContext && this.browser) {
          console.log('检测到现有浏览器实例，使用现有实例创建客户端');
          this.ksClient = await this.createKsClient();
        } else {
          console.log('未检测到现有浏览器实例，完整初始化客户端');
          await this.createKsClient();
        }
      } catch (error) {
        console.log('初始化客户端失败，使用基本客户端:', error);
        const KuaiShouClient = require('./client');
        this.ksClient = new KuaiShouClient({}, this.userAgent);
      }
    } else {
      console.log('使用现有KuaiShou客户端');
    }
    
    try {
      // 尝试使用标准方法获取用户信息
      console.log('尝试获取用户信息...');
      const profileResult = await this.ksClient.getUserProfile(kuaishouId);
      
      if (profileResult && profileResult.data && profileResult.data.userProfile) {
        const userProfile = profileResult.data.userProfile;
        const user = userProfile.profile.user;
        
        // 构建用户信息对象
        const userInfo = {
          id: user.id,
          eid: user.eid,
          name: user.name,
          gender: userProfile.profile.gender,
          avatar: user.avatar,
          fans_count: userProfile.ownerCount?.fan || 0,
          follow_count: userProfile.ownerCount?.follow || 0,
          photo_count: userProfile.ownerCount?.photo || 0,
          liked_count: userProfile.ownerCount?.liked || 0,
          is_following: user.isFollowing,
          is_follower: user.isFollower,
          living: user.living
        };
        
        console.log(`成功获取用户 ${user.name}(${kuaishouId}) 的信息`);
        
        // 为用户创建保存目录
        const savePath = path.resolve(this.dataRootDir, 'user_profiles');
        await utils.ensureDir(savePath);
        
        // 保存用户信息到JSON文件
        const userInfoPath = path.join(savePath, `${kuaishouId}.json`);
        await utils.saveToJson(userInfoPath, userInfo);
        console.log(`用户信息已保存到: ${userInfoPath}`);
        
        return userInfo;
      } else {
        console.log('标准方法获取用户信息失败，尝试使用测试方法...');
        
        // 尝试使用测试方法
        const testResult = await this.ksClient.testGetUserProfile(kuaishouId);
        
        if (testResult) {
          const userProfile = testResult;
          
          // 构建用户信息对象
          const userInfo = {
            id: userProfile.profile.user_id,
            name: userProfile.profile.user_name,
            gender: userProfile.profile.gender,
            avatar: userProfile.profile.headurl,
            description: userProfile.profile.user_text,
            background: userProfile.profile.user_profile_bg_url,
            fans_count: userProfile.ownerCount?.fan || 0,
            follow_count: userProfile.ownerCount?.follow || 0,
            photo_count: userProfile.ownerCount?.photo || 0,
            photo_public_count: userProfile.ownerCount?.photo_public || 0,
            is_following: userProfile.isFollowing
          };
          
          console.log(`成功获取用户 ${userProfile.profile.user_name}(${kuaishouId}) 的信息（测试方法）`);
          
          // 为用户创建保存目录
          const savePath = path.resolve(this.dataRootDir, 'user_profiles');
          await utils.ensureDir(savePath);
          
          // 保存用户信息到JSON文件
          const userInfoPath = path.join(savePath, `${kuaishouId}.json`);
          await utils.saveToJson(userInfoPath, userInfo);
          console.log(`用户信息已保存到: ${userInfoPath}`);
          
          return userInfo;
        }
      }
      
      console.log(`用户 ${kuaishouId} 不存在或获取失败`);
      return null;
    } catch (error) {
      console.log(`获取用户 ${kuaishouId} 信息过程中出现错误，尝试使用测试方法:`, error);
      
      try {
        // 尝试使用测试方法
        const testResult = await this.ksClient.testGetUserProfile(kuaishouId);
        
        if (testResult) {
          const userProfile = testResult;
          
          // 构建用户信息对象
          const userInfo = {
            id: userProfile.profile.user_id,
            name: userProfile.profile.user_name,
            gender: userProfile.profile.gender,
            avatar: userProfile.profile.headurl,
            description: userProfile.profile.user_text,
            background: userProfile.profile.user_profile_bg_url,
            fans_count: userProfile.ownerCount?.fan || 0,
            follow_count: userProfile.ownerCount?.follow || 0,
            photo_count: userProfile.ownerCount?.photo || 0,
            photo_public_count: userProfile.ownerCount?.photo_public || 0,
            is_following: userProfile.isFollowing
          };
          
          console.log(`成功获取用户 ${userProfile.profile.user_name}(${kuaishouId}) 的信息（测试方法）`);
          
          // 为用户创建保存目录
          const savePath = path.resolve(this.dataRootDir, 'user_profiles');
          await utils.ensureDir(savePath);
          
          // 保存用户信息到JSON文件
          const userInfoPath = path.join(savePath, `${kuaishouId}.json`);
          await utils.saveToJson(userInfoPath, userInfo);
          console.log(`用户信息已保存到: ${userInfoPath}`);
          
          return userInfo;
        }
      } catch (testError) {
        console.log('测试方法也失败:', testError);
      }
      
      console.log(`无法获取用户 ${kuaishouId} 的信息`);
      return null;
    }
  }

  /**
   * 获取用户视频列表
   * @param {string} userId 用户ID
   * @param {number} maxCount 最大获取数量
   * @returns {Promise<Array>} 视频列表
   */
  async getUserVideos(userId, maxCount = 20) {
    console.log(`开始获取用户 ${userId} 的视频列表，最大数量: ${maxCount}`);
    
    // 确保有客户端，但避免重复初始化
    if (!this.ksClient) {
      console.log('KuaiShou客户端未初始化，正在初始化...');
      try {
        // 检查是否已有浏览器实例运行
        if (this.browserContext && this.browser) {
          console.log('检测到现有浏览器实例，使用现有实例创建客户端');
          this.ksClient = await this.createKsClient();
        } else {
          console.log('未检测到现有浏览器实例，完整初始化客户端');
          await this.createKsClient();
        }
      } catch (error) {
        console.log('初始化客户端失败，使用基本客户端:', error);
        const KuaiShouClient = require('./client');
        this.ksClient = new KuaiShouClient({}, this.userAgent);
      }
    } else {
      console.log('使用现有KuaiShou客户端');
    }
    
    try {
      // 为用户创建保存目录
      const savePath = path.join(this.dataRootDir, 'user_videos');
      await utils.ensureDir(savePath);
      
      // 删除之前的文件
      const userVideoPath = path.join(savePath, `${userId}.json`);
      try {
        // 检查文件是否存在
        await fs.access(userVideoPath);
        // 文件存在，删除它
        await fs.unlink(userVideoPath);
        console.log(`已删除旧的视频文件: ${userVideoPath}`);
      } catch (err) {
        // 文件不存在，忽略错误
      }
      
      let pcursor = '';
      let allVideos = [];
      let hasMore = true;
      let page = 1;
      
      // 应用天数限制（如果配置中有）
      const daysLimit = this.config.video_filter?.days_limit || 0;
      // 当前时间减去天数限制，获取最早时间戳（毫秒）
      const earliestTimestamp = daysLimit > 0 ? Date.now() - (daysLimit * 24 * 60 * 60 * 1000) : 0;
      
      // 连续空页计数器（连续多少页没有符合日期限制的视频）
      let emptyPagesCount = 0;
      const maxEmptyPages = 3; // 最多允许连续3个空页
      
      // 循环获取所有视频
      while (hasMore && allVideos.length < maxCount) {
        console.log(`正在获取第 ${page} 页视频，当前已获取 ${allVideos.length} 个...`);
        
        // 获取一页视频
        const result = await this.ksClient.getUserVideos(userId, pcursor);
        
        if (result && result.visionProfilePhotoList) {
          const { pcursor: nextCursor, photoList } = result.visionProfilePhotoList;
          
          if (photoList && photoList.length > 0) {
            // 处理视频数据
            const videos = photoList.map(item => {
              return {
                id: item.id,
                caption: item.caption,
                cover_url: item.coverUrl,
                play_url: item.photoUrl,
                timestamp: item.timestamp,
                like_count: item.likeCount,
                comment_count: item.commentCount,
                view_count: item.viewCount,
                duration: item.duration
              };
            });
            
            // 如果有天数限制，则过滤视频
            let filteredVideos = videos;
            if (daysLimit > 0) {
              console.log(`应用天数限制: ${daysLimit}天，最早时间戳: ${new Date(earliestTimestamp).toLocaleString()}`);
              filteredVideos = videos.filter(video => video.timestamp >= earliestTimestamp);
              console.log(`过滤前: ${videos.length}个视频，过滤后: ${filteredVideos.length}个视频`);
            }
            
            // 添加到结果列表
            allVideos = allVideos.concat(filteredVideos);
            console.log(`第 ${page} 页获取成功，新增 ${filteredVideos.length} 个视频`);
            
            // 检查是否获取到了符合条件的视频
            if (filteredVideos.length > 0) {
              // 重置空页计数器
              emptyPagesCount = 0;
            } else {
              // 增加空页计数器
              emptyPagesCount++;
              console.log(`当前页的视频都超出了时间限制，连续空页数: ${emptyPagesCount}/${maxEmptyPages}`);
              
              // 如果连续多页都没有符合条件的视频，则停止获取
              if (emptyPagesCount >= maxEmptyPages) {
                console.log(`已连续 ${maxEmptyPages} 页没有符合时间限制的视频，停止获取`);
                hasMore = false;
                break;
              }
            }
            
            // 更新游标
            pcursor = nextCursor;
            
            // 检查是否还有更多
            hasMore = pcursor !== '' && pcursor !== 'no_more';
            
            // 增加页码
            page++;
            
            // 随机延迟，避免请求过于频繁
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 2000) + 1000));
          } else {
            console.log('当前页没有视频数据');
            hasMore = false;
          }
        } else {
          console.log('获取视频列表失败');
          hasMore = false;
        }
      }
      
      // 截取指定数量
      const result = allVideos.slice(0, maxCount);
      
      // 保存结果
      if (result.length > 0) {
        // 保存视频列表到JSON文件
        const videosPath = path.join(savePath, `${userId}.json`);
        await utils.saveToJson(videosPath, result);
        console.log(`视频列表已保存到: ${videosPath}`);
      }
      
      return result;
    } catch (error) {
      console.error(`获取用户视频列表失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取视频评论
   * @param {string} videoId 视频ID
   * @param {number} maxCount 最大获取数量
   * @returns {Promise<Array>} 评论列表
   */
  async getVideoComments(videoId, maxCount = 20) {
    console.log(`开始获取视频 ${videoId} 的评论，最大数量: ${maxCount}`);
    
    if (!this.ksClient) {
      console.log('KuaiShou客户端未初始化，正在初始化...');
      try {
        await this.createKsClient();
      } catch (error) {
        console.log('初始化客户端失败，使用基本客户端:', error);
        const KuaiShouClient = require('./client');
        this.ksClient = new KuaiShouClient({}, this.userAgent);
      }
    }
    
    try {
      let pcursor = '';
      let allComments = [];
      let hasMore = true;
      let page = 1;
      
      // 循环获取所有评论
      while (hasMore && allComments.length < maxCount) {
        console.log(`正在获取第 ${page} 页评论，当前已获取 ${allComments.length} 条...`);
        
        // 获取一页评论
        const result = await this.ksClient.getVideoComments(videoId, pcursor);
        
        if (result && result.commentCount !== undefined) {
          const { commentCount, pcursor: nextCursor, rootComments } = result;
          
          if (rootComments && rootComments.length > 0) {
            // 处理评论数据
            const comments = rootComments.map(comment => {
              // 提取子评论
              const subComments = comment.subComments ? comment.subComments.map(subComment => {
                return {
                  id: subComment.commentId,
                  content: subComment.content,
                  author_id: subComment.authorId,
                  author_name: subComment.authorName,
                  avatar: subComment.headurl,
                  timestamp: subComment.timestamp,
                  like_count: subComment.likedCount,
                  reply_to: subComment.replyTo,
                  reply_to_user_name: subComment.replyToUserName
                };
              }) : [];
              
              // 返回主评论
              return {
                id: comment.commentId,
                content: comment.content,
                author_id: comment.authorId,
                author_name: comment.authorName,
                avatar: comment.headurl,
                timestamp: comment.timestamp,
                like_count: comment.likedCount,
                sub_comment_count: comment.subCommentCount,
                sub_comments: subComments
              };
            });
            
            // 添加到结果列表
            allComments = allComments.concat(comments);
            console.log(`第 ${page} 页获取成功，新增 ${comments.length} 条评论`);
            
            // 更新游标
            pcursor = nextCursor;
            
            // 检查是否还有更多
            hasMore = pcursor !== '' && pcursor !== 'no_more';
            
            // 增加页码
            page++;
            
            // 随机延迟，避免请求过于频繁
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 2000) + 1000));
          } else {
            console.log('当前页没有评论数据');
            hasMore = false;
          }
        } else {
          console.log('获取评论列表失败');
          hasMore = false;
        }
      }
      
      // 截取指定数量
      const result = allComments.slice(0, maxCount);
      
      // 保存结果
      if (result.length > 0) {
        // 创建保存目录
        const savePath = path.resolve(this.dataRootDir, 'video_comments');
        await utils.ensureDir(savePath);
        
        // 保存评论列表到JSON文件
        const commentsPath = path.join(savePath, `${videoId}.json`);
        await utils.saveToJson(commentsPath, result);
        console.log(`评论列表已保存到: ${commentsPath}`);
      }
      
      return result;
    } catch (error) {
      console.error(`获取视频评论失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 关闭爬虫，释放资源
   */
  async close() {
    try {
      if (this.contextPage) {
        await this.contextPage.close();
        this.contextPage = null;
      }
      
      if (this.browserContext) {
        await this.browserContext.close();
        this.browserContext = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      console.log('资源已释放');
    } catch (error) {
      console.error('关闭资源时出错:', error);
    }
  }
}

module.exports = KuaishouCrawler; 