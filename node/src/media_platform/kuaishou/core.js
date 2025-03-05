/**
 * MediaCrawler
 * 
 * 注意：本项目仅供学习和研究使用，不得用于商业用途
 * 请遵守相关法律法规，合理使用本工具
 * 切勿用于非法用途，否则后果自负
 */

const path = require('path');
const fs = require('fs');
const pLimit = require('p-limit');
const { chromium } = require('playwright');
const moment = require('moment');

const AbstractCrawler = require('../abstract_crawler');
const KuaiShouClient = require('./client');
const KuaishouLogin = require('./login'); // 导入登录模块
const utils = require('../../utils');
const { formatProxyInfo } = require('../../utils/proxy');

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
      proxy: null
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
      
      // 检查页面上是否有登录按钮
      const loginButtonSelector = '.login-guide-mask';
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
          (cookie.name === 'userId' || cookie.name === 'kuaishou.web.cp.api_st') && cookie.value
        );
        
        if (hasLoginCookies) {
          console.log('发现登录cookies，确认已登录');
          return true;
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
      
      // 此处添加获取二维码和扫码登录的代码
      // ...
      
      return true;
    } catch (error) {
      console.error('二维码登录失败:', error);
      return false;
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
            
            // 返回主评论和子评论
            return {
              comment_id: comment.commentId,
              author_id: comment.authorId,
              author_name: comment.authorName,
              author_avatar: comment.authorAvatar,
              content: comment.content,
              timestamp: comment.timestamp,
              create_time: moment(comment.timestamp).format('YYYY-MM-DD HH:mm:ss'),
              liked_count: comment.likedCount,
              reply_count: comment.replyCount,
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
      const fs = require('fs');
      
      // 用户数据目录
      const userDataDir = path.join(this.browserDataDir, 'kuaishou_user_data_dir');
      
      // 确保目录存在
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }
      
      // 随机生成一个真实的用户代理
      this.userAgent = utils.getUserAgent();
      console.log('使用用户代理:', this.userAgent);
      
      // 浏览器上下文选项
      const contextOptions = {
        headless: this.config.headless === undefined ? false : this.config.headless,
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
          fans_count: userProfile.ownerCount.fan,
          follow_count: userProfile.ownerCount.follow,
          photo_count: userProfile.ownerCount.photo
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
   * 通过快手号获取用户信息
   * @param {string} kuaishouId 快手号
   * @returns {Promise<object>} 用户信息
   */
  async getUserProfile(kuaishouId) {
    console.log(`开始获取快手号为 ${kuaishouId} 的用户信息`);
    
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
          fans_count: userProfile.ownerCount.fan,
          follow_count: userProfile.ownerCount.follow,
          photo_count: userProfile.ownerCount.photo,
          liked_count: userProfile.ownerCount.liked,
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
            fans_count: userProfile.ownerCount.fan,
            follow_count: userProfile.ownerCount.follow,
            photo_count: userProfile.ownerCount.photo,
            photo_public_count: userProfile.ownerCount.photo_public,
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
            fans_count: userProfile.ownerCount.fan,
            follow_count: userProfile.ownerCount.follow,
            photo_count: userProfile.ownerCount.photo,
            photo_public_count: userProfile.ownerCount.photo_public,
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
      // 为用户创建保存目录
      const savePath = path.resolve(this.dataRootDir, 'user_videos');
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