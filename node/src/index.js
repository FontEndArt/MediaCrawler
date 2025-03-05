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

// 检查配置文件
async function checkAndCreateConfig() {
  const configPath = path.resolve(process.cwd(), 'config.json');
  
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
      }
    };
    
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
    console.log('默认配置文件已创建，请根据需要修改后再运行');
    process.exit(0);
  }
}

async function prepareDataDir() {
  // 确保数据目录存在
  const dataDir = path.resolve(process.cwd(), 'data');
  await utils.ensureDir(dataDir);
  
  // 确保各类型数据目录存在
  await utils.ensureDir(path.join(dataDir, 'search'));
  await utils.ensureDir(path.join(dataDir, 'detail'));
  await utils.ensureDir(path.join(dataDir, 'creator'));
  await utils.ensureDir(path.join(dataDir, 'user_profiles')); // 添加用户资料目录
  await utils.ensureDir(path.join(dataDir, 'user_videos')); // 添加用户视频目录
  await utils.ensureDir(path.join(dataDir, 'video_comments')); // 添加视频评论目录
}

/**
 * 获取快手用户资料
 * @param {string} userId 快手用户ID
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

async function main() {
  console.log('MediaCrawler 正在启动...');
  
  try {
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