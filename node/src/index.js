/**
 * MediaCrawler入口文件
 * 
 * 注意：本项目仅供学习和研究使用，不得用于商业用途
 * 请遵守相关法律法规，合理使用本工具
 * 切勿用于非法用途，否则后果自负
 */

const KuaishouCrawler = require('./media_platform/kuaishou/core');
const path = require('path');
const fs = require('fs').promises;
const utils = require('./utils');
const schedule = require('node-schedule');
const yargs = require('yargs');

// 检查配置文件
async function checkAndCreateConfig() {
  // 将配置文件路径改为node目录下，而不是主项目目录
  const configPath = path.resolve(__dirname, '..', 'config.json');
  
  // 打印出实际使用的配置文件路径，用于调试
  console.log('使用的配置文件路径:', configPath);
  
  try {
    await fs.access(configPath);
    console.log('配置文件已存在，正在使用现有配置');
  } catch (error) {
    console.log('配置文件不存在，创建默认配置...');
    
    const defaultConfig = {
      "crawler_type": "search", // 爬取类型: search/detail/creator
      "search_keywords": ["搞笑", "宠物"], // 搜索关键词列表
      "video_id_list": [], // 视频ID列表（detail模式使用）
      "creator_id_list": [], // 创作者ID列表（creator模式使用）
      "max_pages": 3, // 最大爬取页数
      "max_comment_pages": 3, // 最大评论页数
      "get_comments": true, // 是否获取评论
      "get_video_detail": true, // 是否获取视频详情（creator模式使用）
      "headless": true, // 是否使用无头模式
      "use_proxy": false, // 是否使用代理
      "ip_proxy_info": { // 代理信息
        "ip": "",
        "port": "",
        "username": "",
        "password": ""
      },
      // 添加新的定时任务配置
      "schedule_enabled": false, // 是否启用定时任务
      "schedule_interval": 60, // 定时任务间隔（分钟）
      // 添加监控账号配置
      "monitor_user_list": [], // 要监控的快手用户ID列表
      // 添加视频过滤配置
      "video_filter": {
        "days_limit": 7, // 只获取最近X天的视频
        "min_likes": 1000, // 最低点赞数
        "save_video_url": true // 是否保存视频URL
      },
      // 添加登录配置
      "login_required": false, // 是否需要登录才能执行操作
      "login_timeout": 60, // 登录等待超时时间（秒）
    };
    
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
    console.log(`默认配置已创建: ${configPath}`);
  }
  
  return configPath;
}

// 准备数据目录
async function prepareDataDir() {
  // 将数据目录改为node目录下
  const dataDir = path.resolve(__dirname, '..', 'data');
  await utils.ensureDir(dataDir);
  
  // 确保各类型数据目录存在
  await utils.ensureDir(path.join(dataDir, 'search'));
  await utils.ensureDir(path.join(dataDir, 'detail'));
  await utils.ensureDir(path.join(dataDir, 'creator'));
  await utils.ensureDir(path.join(dataDir, 'user_profiles')); // 添加用户资料目录
  await utils.ensureDir(path.join(dataDir, 'user_videos')); // 添加用户视频目录
  await utils.ensureDir(path.join(dataDir, 'video_comments')); // 添加视频评论目录
  await utils.ensureDir(path.join(dataDir, 'monitor')); // 添加监控目录
  
  return dataDir;
}

/**
 * 获取快手用户资料
 * @param {string} userId 用户ID
 */
async function getUserProfile(userId) {
  try {
    console.log(`开始获取快手用户资料: ${userId}`);
    
    // 初始化爬虫
    const config = await utils.loadConfig(path.resolve(__dirname, '..', 'config.json'));
    const crawler = new KuaishouCrawler(config);
    
    // 将爬虫实例保存到全局变量
    global.runningCrawler = crawler;
    
    // 启动爬虫
    await crawler.start();
    
    // 获取用户资料
    const user = await crawler.getUserProfile(userId);
    
    if (!user) {
      console.error(`获取用户 ${userId} 资料失败`);
      await crawler.close();
      return false;
    }
    
    // 保存用户信息
    const userProfileDir = path.join(crawler.dataRootDir, 'profiles');
    await utils.ensureDir(userProfileDir);
    const savePath = path.join(userProfileDir, `user_${userId}.json`);
    await utils.saveToJson(savePath, user);
    
    console.log(`成功获取并保存用户 ${user.user_name || userId} 资料到 ${savePath}`);
    await crawler.close();
    return true;
  } catch (error) {
    console.error('获取用户资料出错:', error);
    return false;
  }
}

/**
 * 获取用户视频列表
 * @param {string} userId 用户ID
 * @param {number} count 获取视频数量
 */
async function getUserVideos(userId, count) {
  try {
    console.log(`开始获取快手用户 ${userId} 的视频列表，数量: ${count}`);
    
    // 初始化爬虫
    const config = await utils.loadConfig(path.resolve(__dirname, '..', 'config.json'));
    const crawler = new KuaishouCrawler(config);
    
    // 将爬虫实例保存到全局变量
    global.runningCrawler = crawler;
    
    // 启动爬虫
    await crawler.start();
    
    // 获取用户视频
    const videos = await crawler.getUserVideos(userId, count);
    
    if (!videos || videos.length === 0) {
      console.error(`获取用户 ${userId} 视频失败或无视频`);
      await crawler.close();
      return false;
    }
    
    // 保存用户视频信息
    const userVideosDir = path.join(crawler.dataRootDir, 'videos');
    await utils.ensureDir(userVideosDir);
    const savePath = path.join(userVideosDir, `user_${userId}_videos.json`);
    await utils.saveToJson(savePath, videos);
    
    console.log(`成功获取并保存用户 ${userId} 的 ${videos.length} 个视频到 ${savePath}`);
    await crawler.close();
    return true;
  } catch (error) {
    console.error('获取用户视频出错:', error);
    return false;
  }
}

/**
 * 获取视频评论
 * @param {string} videoId 视频ID
 * @param {number} count 获取评论数量
 */
async function getVideoComments(videoId, count) {
  try {
    console.log(`开始获取视频 ${videoId} 的评论，数量: ${count}`);
    
    // 创建快手爬虫实例
    const crawler = new KuaishouCrawler();
    
    // 启动爬虫
    await crawler.start();
    
    // 获取视频评论
    const comments = await crawler.getVideoComments(videoId, count);
    
    // 关闭爬虫
    await crawler.close();
    
    if (comments && comments.length > 0) {
      console.log(`成功获取视频 ${videoId} 的评论，共 ${comments.length} 条:`);
      console.log(JSON.stringify(comments.slice(0, 5), null, 2)); // 只显示前5条评论的详情
      console.log(`...共 ${comments.length} 条评论`);
    } else {
      console.log(`无法获取视频 ${videoId} 的评论或评论为空`);
    }
  } catch (error) {
    console.error('获取视频评论时出错:', error);
  }
}

/**
 * 监控用户视频
 */
async function monitorUsers() {
  try {
    console.log('开始监控用户视频...');
    
    // 读取配置文件
    const configPath = await checkAndCreateConfig();
    const configData = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    // 获取数据目录
    const dataDir = await prepareDataDir();
    
    // 清理临时数据
    const tempDir = path.resolve(__dirname, '..', 'temp');
    await utils.ensureDir(tempDir);
    await utils.cleanupOldFiles(tempDir, 1); // 清理超过1天的临时文件
    
    // 检查用户列表
    if (!config.monitor_user_list || config.monitor_user_list.length === 0) {
      console.error('错误: 配置文件中未指定要监控的用户列表');
      console.log('请在config.json中添加monitor_user_list字段，并指定要监控的用户ID');
      process.exit(1);
    }
    
    // 定义抓取任务
    const runCrawlTask = async () => {
      console.log(`[${new Date().toLocaleString()}] 开始执行定时抓取任务...`);
      
      // 为每个用户创建保存目录
      const monitorDir = path.join(dataDir, 'monitor');
      await utils.ensureDir(monitorDir);
      
      // 清理监控目录中的旧文件
      for (const userId of config.monitor_user_list) {
        const userMonitorPath = path.join(monitorDir, `${userId}.json`);
        try {
          // 检查文件是否存在
          await fs.access(userMonitorPath);
          // 文件存在，删除它
          await fs.unlink(userMonitorPath);
          console.log(`已删除旧的监控结果: ${userMonitorPath}`);
        } catch (err) {
          // 文件不存在，忽略错误
        }
      }
      
      // 获取视频过滤条件
      const daysLimit = config.video_filter?.days_limit || 7;
      const minLikes = config.video_filter?.min_likes || 1000;
      
      // 当前时间减去天数限制，获取最早时间戳（毫秒）
      const earliestTimestamp = Date.now() - (daysLimit * 24 * 60 * 60 * 1000);
      
      // 创建并启动爬虫（仅一次）
      const crawler = new KuaishouCrawler(config);
      
      // 将爬虫实例保存到全局变量
      global.runningCrawler = crawler;
      
      await crawler.start();
      
      try {
        // 为每个用户获取视频
        for (const userId of config.monitor_user_list) {
          console.log(`正在抓取用户 ${userId} 的视频...`);
          
          // 获取最新的X个视频
          const videos = await crawler.getUserVideos(userId, 50); // 获取最新的50个视频，后面会根据点赞数过滤
          
          if (videos && videos.length > 0) {
            // 过滤视频：只保留点赞数大于等于指定值的视频（日期过滤已在getUserVideos中完成）
            const filteredVideos = videos.filter(video => {
              // 解析点赞数（可能是字符串格式）
              let likeCount = 0;
              if (video.like_count) {
                if (typeof video.like_count === 'string') {
                  // 处理可能带有"万"等后缀的字符串
                  if (video.like_count.includes('万') || video.like_count.includes('w')) {
                    likeCount = parseFloat(video.like_count) * 10000;
                  } else {
                    likeCount = parseInt(video.like_count.replace(/,/g, ''));
                  }
                } else {
                  likeCount = video.like_count;
                }
              }
              
              // 检查点赞数
              const hasEnoughLikes = likeCount >= minLikes;
              
              return hasEnoughLikes;
            });
            
            if (filteredVideos.length > 0) {
              console.log(`用户 ${userId} 有 ${filteredVideos.length} 个符合条件的视频`);
              
              // 提取视频访问地址和直链
              const videoUrls = filteredVideos.map(video => {
                return {
                  id: video.id,
                  caption: video.caption,
                  timestamp: video.timestamp,
                  publish_time: new Date(video.timestamp).toLocaleString(),
                  like_count: video.like_count,
                  page_url: `https://www.kuaishou.com/short-video/${video.id}`,
                  play_url: video.play_url
                };
              });
              
              // 保存结果
              const userMonitorPath = path.join(monitorDir, `${userId}.json`);
              await utils.saveToJson(userMonitorPath, videoUrls);
              console.log(`用户 ${userId} 的监控结果已保存到: ${userMonitorPath}`);
            } else {
              console.log(`用户 ${userId} 没有符合条件的视频`);
            }
          } else {
            console.log(`未能获取用户 ${userId} 的视频或列表为空`);
          }
        }
      } finally {
        // 关闭爬虫
        await crawler.close();
      }
      
      console.log(`[${new Date().toLocaleString()}] 定时抓取任务完成`);
    };
    
    // 立即执行一次
    await runCrawlTask();
    
    // 启动定时任务
    if (config.schedule_enabled) {
      const intervalMinutes = config.schedule_interval || 60;
      
      // 创建定时抓取任务 - 按指定的间隔时间运行
      const job = schedule.scheduleJob(`*/${intervalMinutes} * * * *`, runCrawlTask);
      
      // 创建每天凌晨3点运行的清理任务
      const cleanupJob = schedule.scheduleJob('0 3 * * *', async () => {
        console.log(`[${new Date().toLocaleString()}] 开始执行每日清理任务...`);
        
        // 清理临时数据目录
        const tempDir = path.resolve(__dirname, '..', 'temp');
        await utils.cleanupOldFiles(tempDir, 1);
        
        // 清理浏览器缓存目录
        const browserDataDir = path.resolve(__dirname, '..', 'browser_data');
        await utils.cleanupOldFiles(browserDataDir, 7); // 浏览器数据保留7天
        
        console.log(`[${new Date().toLocaleString()}] 每日清理任务完成`);
      });
      
      console.log(`已启用定时任务，间隔: ${intervalMinutes} 分钟`);
      console.log(`下次执行时间: ${job.nextInvocation()}`);
    }
  } catch (error) {
    console.error('监控用户视频时出错:', error);
  }
}

/**
 * 执行登录操作
 */
async function performLogin() {
  try {
    console.log('开始执行登录操作...');
    
    // 加载配置
    const config = await utils.loadConfig(path.resolve(__dirname, '..', 'config.json'));
    
    // 修改配置，确保登录要求被启用
    config.login_required = true;
    
    // 创建爬虫实例
    const crawler = new KuaishouCrawler(config);
    
    // 将爬虫实例保存到全局变量
    global.runningCrawler = crawler;
    
    // 启动爬虫（会自动执行登录流程）
    await crawler.start();
    
    // 检查登录状态
    const isLoggedIn = await crawler.checkLoginState();
    
    if (isLoggedIn) {
      console.log('登录成功！登录状态已保存');
      
      // 保存cookies以便后续使用
      const cookies = await crawler.browserContext.cookies();
      const cookiesPath = path.join(crawler.dataRootDir, 'cookies.json');
      await utils.ensureDir(path.dirname(cookiesPath));
      await utils.saveToJson(cookiesPath, cookies);
      console.log(`Cookies已保存到: ${cookiesPath}`);
    } else {
      console.log('登录失败或取消，请稍后重试');
    }
    
    // 关闭爬虫
    await crawler.close();
    
  } catch (error) {
    console.error('登录过程中出错:', error);
  }
}

// 添加命令行参数处理
const argv = yargs
  .option('mode', {
    alias: 'm',
    describe: '运行模式: monitor/login/profile/videos/comments',
    type: 'string',
    default: 'monitor'
  })
  .option('id', {
    alias: 'i',
    describe: '用户ID或快手号(用于profile和videos模式)或视频ID(用于comments模式)',
    type: 'string'
  })
  .option('count', {
    alias: 'c',
    describe: '需要获取的数据量',
    type: 'number',
    default: 20
  })
  .help()
  .alias('help', 'h')
  .argv;

// 根据模式执行不同的任务
async function main() {
  try {
    console.log('MediaCrawler 正在启动...');
    
    // 检查配置文件
    await checkAndCreateConfig();
    
    // 准备数据目录
    await prepareDataDir();
    
    switch (argv.mode) {
      case 'monitor':
        await monitorUsers();
        break;
      case 'login':
        await performLogin();
        break;
      case 'profile':
      case 'videos':
        if (!argv.id) {
          console.error(`缺少必要参数: --id/-i (用户ID或快手号)`);
          return;
        }
        
        // 检查是否为快手ID或快手号
        let kuaishouId = argv.id;
        // 如果参数是URL，提取ID部分
        if (kuaishouId.includes('kuaishou.com/profile/')) {
          const match = kuaishouId.match(/\/profile\/([^/?#]+)/);
          if (match && match[1]) {
            kuaishouId = match[1];
            console.log(`从URL中提取到快手ID: ${kuaishouId}`);
          }
        }
        
        // 初始化临时爬虫实例用于转换
        const config = await utils.loadConfig(path.resolve(__dirname, '..', 'config.json'));
        
        // 判断是否为有效的快手ID，否则尝试将其作为快手号获取快手ID
        try {
          console.log(`尝试验证参数 ${kuaishouId} 是否为快手ID...`);
          
          // 创建并启动爬虫（仅一次）
          const crawler = new KuaishouCrawler(config);
          
          // 将爬虫实例保存到全局变量
          global.runningCrawler = crawler;
          
          await crawler.start();
          
          // 使用新的isValidKuaishouId方法验证
          const isValidId = await crawler.isValidKuaishouId(kuaishouId);
          
          if (isValidId) {
            console.log(`验证成功，确认 ${kuaishouId} 是有效的快手ID，可以直接使用`);
          } else {
            console.log(`${kuaishouId} 不是有效的快手ID，尝试将其作为快手号获取对应的快手ID...`);
            
            try {
              // 通过快手号获取快手ID
              const realKuaishouId = await crawler.getKuaishouIdByUsername(kuaishouId);
              
              if (!realKuaishouId) {
                console.error(`无法通过 ${kuaishouId} 获取快手ID，任务终止`);
                await crawler.close();
                return;
              }
              
              console.log(`已成功将 ${kuaishouId} 转换为快手ID: ${realKuaishouId}`);
              kuaishouId = realKuaishouId;
            } catch (error) {
              console.log(`获取快手ID时出错: ${error.message}`);
              console.log('尝试使用搜索方式获取快手ID...');
              
              // 不再创建新的爬虫实例，直接使用现有的
              try {
                // 使用现有爬虫实例获取快手ID
                const realKuaishouId = await crawler.getKuaishouIdByUsername(kuaishouId);
                
                if (!realKuaishouId) {
                  console.error(`无法通过 ${kuaishouId} 获取快手ID，任务终止`);
                  await crawler.close();
                  return;
                }
                
                console.log(`已成功将 ${kuaishouId} 转换为快手ID: ${realKuaishouId}`);
                kuaishouId = realKuaishouId;
              } catch (searchError) {
                console.error(`搜索获取快手ID失败: ${searchError.message}`);
                await crawler.close();
                return;
              }
            }
          }
          
          // 根据模式调用相应的函数，使用同一个爬虫实例
          if (argv.mode === 'profile') {
            // 使用已启动的爬虫实例获取用户信息
            const userInfo = await crawler.getUserProfile(kuaishouId);
            console.log(`用户信息获取${userInfo ? '成功' : '失败'}`);
            
            if (userInfo) {
              // 保存用户信息
              const savePath = path.join(crawler.dataRootDir, 'user_profiles');
              await utils.ensureDir(savePath);
              const userInfoPath = path.join(savePath, `${kuaishouId}.json`);
              await utils.saveToJson(userInfoPath, userInfo);
              console.log(`成功获取并保存用户 ${userInfo.name || kuaishouId} 资料到 ${userInfoPath}`);
            }
          } else {  // videos模式
            // 使用已启动的爬虫实例获取用户视频
            const videos = await crawler.getUserVideos(kuaishouId, argv.count);
            console.log(`用户视频获取${videos && videos.length > 0 ? '成功' : '失败'}`);
          }
          
          // 所有操作完成后关闭爬虫
          await crawler.close();
        } catch (error) {
          console.log(`验证过程中出错: ${error.message}`);
          return;
        }
        break;
      case 'comments':
        if (!argv.id) {
          console.error('缺少必要参数: --id/-i (视频ID)');
          return;
        }
        await getVideoComments(argv.id, argv.count);
        break;
      default:
        console.error(`未知的运行模式: ${argv.mode}`);
    }
  } catch (error) {
    console.error('程序运行出错:', error);
  }
}

// 启动程序
main().catch(err => {
  console.error('未处理的错误:', err);
  process.exit(1);
});