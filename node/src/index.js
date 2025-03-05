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
      }
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
    
    // 创建快手爬虫实例
    const crawler = new KuaishouCrawler();
    
    // 启动爬虫
    await crawler.start();
    
    // 获取用户资料
    const userProfile = await crawler.getUserProfile(userId);
    
    // 关闭爬虫
    await crawler.close();
    
    if (userProfile) {
      console.log('用户资料获取成功:');
      console.log(JSON.stringify(userProfile, null, 2));
    } else {
      console.log(`无法获取用户 ${userId} 的资料`);
    }
  } catch (error) {
    console.error('获取用户资料时出错:', error);
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
    
    // 创建快手爬虫实例
    const crawler = new KuaishouCrawler();
    
    // 启动爬虫
    await crawler.start();
    
    // 获取用户视频列表
    const videos = await crawler.getUserVideos(userId, count);
    
    // 关闭爬虫
    await crawler.close();
    
    if (videos && videos.length > 0) {
      console.log(`成功获取用户 ${userId} 的视频列表，共 ${videos.length} 个视频:`);
      console.log(JSON.stringify(videos.slice(0, 3), null, 2)); // 只显示前3个视频的详情
      console.log(`...共 ${videos.length} 个视频`);
    } else {
      console.log(`无法获取用户 ${userId} 的视频列表或列表为空`);
    }
  } catch (error) {
    console.error('获取用户视频列表时出错:', error);
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
      
      // 创建爬虫实例
      const crawler = new KuaishouCrawler(config);
      
      try {
        // 启动爬虫
        await crawler.start();
        
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
                  if (video.like_count.includes('万')) {
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
      console.log(`每日清理时间: 凌晨3点`);
      console.log(`定时任务已启动，按Ctrl+C停止...`);
      
      // 保持进程运行
      process.stdin.resume();
    } else {
      console.log('未启用定时任务，只执行一次爬取');
    }
  } catch (error) {
    console.error('监控用户视频时出错:', error);
  }
}

async function main() {
  try {
    console.log('MediaCrawler 正在启动...');
    
    // 检查配置文件
    await checkAndCreateConfig();
    
    // 准备数据目录
    await prepareDataDir();
    
    // 解析命令行参数
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (command === 'get-user-profile') {
      // 获取用户资料模式
      const userId = args[1];
      if (!userId) {
        console.error('错误: 请提供用户ID');
        console.log('用法: node index.js get-user-profile <用户ID>');
        process.exit(1);
      }
      
      await getUserProfile(userId);
    } else if (command === 'get-user-videos') {
      // 获取用户视频列表模式
      const userId = args[1];
      const count = args[2] ? parseInt(args[2]) : 20; // 默认获取20个视频
      
      if (!userId) {
        console.error('错误: 请提供用户ID');
        console.log('用法: node index.js get-user-videos <用户ID> [视频数量]');
        process.exit(1);
      }
      
      await getUserVideos(userId, count);
    } else if (command === 'get-video-comments') {
      // 获取视频评论模式
      const videoId = args[1];
      const count = args[2] ? parseInt(args[2]) : 20; // 默认获取20条评论
      
      if (!videoId) {
        console.error('错误: 请提供视频ID');
        console.log('用法: node index.js get-video-comments <视频ID> [评论数量]');
        process.exit(1);
      }
      
      await getVideoComments(videoId, count);
    } else if (command === 'monitor-users') {
      // 监控用户视频模式
      await monitorUsers();
    } else {
      // 默认模式 - 创建快手爬虫实例并开始常规爬取
      const crawler = new KuaishouCrawler();
      await crawler.start();
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