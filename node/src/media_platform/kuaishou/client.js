const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const crypto = require('crypto-js');
const utils = require('../../utils');

/**
 * 快手API客户端类
 */
class KuaiShouClient {
  constructor(cookies = {}, userAgent, proxy = null) {
    this.baseUrl = 'https://www.kuaishou.com';
    this.apiUrl = 'https://www.kuaishou.com/graphql';
    this.userAgent = userAgent || utils.getUserAgent();
    
    // 初始化cookie jar
    this.cookieJar = new CookieJar();
    
    // 设置cookies
    if (cookies && Object.keys(cookies).length > 0) {
      Object.entries(cookies).forEach(([key, value]) => {
        this.cookieJar.setCookieSync(`${key}=${value}`, this.baseUrl);
      });
    }
    
    // 创建axios实例
    this.client = wrapper(axios.create({
      baseURL: this.baseUrl,
      jar: this.cookieJar,
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Content-Type': 'application/json',
        'Origin': this.baseUrl,
        'Referer': this.baseUrl
      },
      timeout: 30000,
      ...(proxy && typeof proxy === 'object' ? proxy : {})
    }));
  }

  /**
   * 更新cookies
   * @param {object} cookieObj cookie对象
   * @param {string} cookieStr cookie字符串
   */
  updateCookies(cookieObj, cookieStr) {
    // 清除现有cookies
    this.cookieJar = new CookieJar();
    
    // 添加新cookies
    Object.entries(cookieObj).forEach(([key, value]) => {
      this.cookieJar.setCookieSync(`${key}=${value}`, this.baseUrl);
    });
    
    // 更新axios实例
    this.client = wrapper(axios.create({
      baseURL: this.baseUrl,
      jar: this.cookieJar,
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Content-Type': 'application/json',
        'Origin': this.baseUrl,
        'Referer': this.baseUrl,
        'Cookie': cookieStr
      },
      timeout: 30000
    }));
  }

  /**
   * 检查登录状态
   * @returns {Promise<boolean>} 是否已登录
   */
  async ping() {
    try {
      // 获取所有cookie
      const cookies = [];
      this.cookieJar.getCookiesSync(this.baseUrl).forEach(cookie => {
        cookies.push({ name: cookie.key, value: cookie.value });
      });
      
      // 检查是否有登录凭证
      const cookieObj = cookies.reduce((obj, cookie) => {
        obj[cookie.name] = cookie.value;
        return obj;
      }, {});
      
      // 快手登录状态的关键cookie是passToken
      if (!cookieObj.passToken) {
        return false;
      }
      
      // 尝试访问需要登录的API
      const response = await this.client.get(`${this.baseUrl}/profile/`, {
        headers: {
          'Referer': this.baseUrl
        }
      });
      
      return response.status === 200;
    } catch (error) {
      console.error('检查登录状态失败:', error.message);
      return false;
    }
  }

  /**
   * 生成快手签名
   * @private
   * @returns {string} 签名
   */
  _generateSignature() {
    // 这里实现快手签名算法，根据实际需要修改
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const signStr = `${timestamp}${randomStr}`;
    return crypto.MD5(signStr).toString();
  }

  /**
   * 发送GraphQL请求
   * @param {string} operationName 操作名称
   * @param {object} variables 请求变量
   * @param {string} query GraphQL查询语句
   * @returns {Promise<object>} 请求结果
   */
  async sendGraphQLRequest(operationName, variables, query) {
    try {
      console.log(`发送GraphQL请求: ${operationName}`);
      
      // 随机延迟，避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 2000) + 1000));
      
      // 添加必要的请求头
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': this.userAgent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Origin': this.baseUrl,
        'Referer': `${this.baseUrl}/search/video?searchKey=${encodeURIComponent(variables.keyword || '')}`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'TE': 'trailers'
      };
      
      // 构建请求体
      const requestBody = {
        operationName,
        variables,
        query
      };
      
      // 打印请求详情
      console.log('请求URL:', this.apiUrl);
      console.log('请求头:', JSON.stringify(headers));
      
      const response = await this.client.post(this.apiUrl, requestBody, { 
        headers,
        timeout: 30000, // 增加超时时间
        validateStatus: status => status < 500 // 允许400类错误
      });
      
      // 记录响应状态
      console.log(`响应状态: ${response.status}`);
      
      // 随机延迟，避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1500) + 500));
      
      if (response.status !== 200) {
        console.warn(`请求状态异常: ${response.status}`);
        if (response.status === 403) {
          console.error('可能被限流或封禁，等待较长时间后重试');
          await new Promise(resolve => setTimeout(resolve, 30000 + Math.random() * 30000));
        }
        return null;
      }
      
      // 检查响应数据
      if (!response.data) {
        console.error('响应数据为空');
        return null;
      }
      
      // 调试输出
      if (response.data.errors) {
        console.error('GraphQL错误:', JSON.stringify(response.data.errors));
      }
      
      return response.data.data || response.data;
    } catch (error) {
      console.error(`GraphQL请求失败 [${operationName}]: ${error.message}`);
      // 显示详细错误
      if (error.response) {
        console.error('错误响应:', JSON.stringify({
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        }));
      }
      return null;
    }
  }

  /**
   * 搜索视频
   * @param {string} keyword 搜索关键词
   * @param {number} page 页码
   * @returns {Promise<object>} 搜索结果
   */
  async searchVideos(keyword, page = 1) {
    console.log(`搜索关键词: ${keyword}, 页码: ${page}`);
    
    try {
      const query = `
        fragment photoContent on PhotoEntity {
          __typename
          id
          duration
          caption
          originCaption
          likeCount
          viewCount
          commentCount
          realLikeCount
          coverUrl
          photoUrl
          photoH265Url
          manifest
          manifestH265
          videoResource
          coverUrls {
            url
            __typename
          }
          timestamp
          expTag
          animatedCoverUrl
          distance
          videoRatio
          liked
          stereoType
          profileUserTopPhoto
          musicBlocked
        }
        
        fragment recoPhotoFragment on recoPhotoEntity {
          __typename
          id
          duration
          caption
          originCaption
          likeCount
          viewCount
          commentCount
          realLikeCount
          coverUrl
          photoUrl
          photoH265Url
          manifest
          manifestH265
          videoResource
          coverUrls {
            url
            __typename
          }
          timestamp
          expTag
          animatedCoverUrl
          distance
          videoRatio
          liked
          stereoType
          profileUserTopPhoto
          musicBlocked
        }
        
        fragment feedContent on Feed {
          type
          author {
            id
            name
            headerUrl
            following
            headerUrls {
              url
              __typename
            }
            __typename
          }
          photo {
            ...photoContent
            ...recoPhotoFragment
            __typename
          }
          canAddComment
          llsid
          status
          currentPcursor
          tags {
            type
            name
            __typename
          }
          __typename
        }
        
        query visionSearchPhoto($keyword: String, $pcursor: String, $searchSessionId: String, $page: String, $webPageArea: String) {
          visionSearchPhoto(keyword: $keyword, pcursor: $pcursor, searchSessionId: $searchSessionId, page: $page, webPageArea: $webPageArea) {
            result
            llsid
            webPageArea
            feeds {
              ...feedContent
              __typename
            }
            searchSessionId
            pcursor
            aladdinBanner {
              imgUrl
              link
              __typename
            }
            __typename
          }
        }
      `;
      
      const variables = {
        keyword,
        page: "search",
        pcursor: page === 1 ? "" : page.toString(),
        searchSessionId: Date.now().toString(),
        webPageArea: ""
      };
      
      // 打印请求参数
      console.log('搜索请求参数:', JSON.stringify(variables));
      
      const response = await this.sendGraphQLRequest('visionSearchPhoto', variables, query);
      
      // 打印响应状态
      console.log('搜索响应状态:', response ? '成功' : '失败');
      
      return response;
    } catch (error) {
      console.error(`搜索视频失败 [${keyword}]: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取视频详情
   * @param {string} photoId 视频ID
   * @returns {Promise<object>} 视频详情
   */
  async getVideoInfo(photoId) {
    const query = `
      query visionVideoDetail($photoId: String, $type: String, $page: String, $webPageArea: String) {
        visionVideoDetail(photoId: $photoId, type: $type, page: $page, webPageArea: $webPageArea) {
          status
          type
          author {
            id
            name
            following
            headerUrl
            __typename
          }
          photo {
            id
            duration
            caption
            likeCount
            realLikeCount
            coverUrl
            photoUrl
            liked
            timestamp
            expTag
            llsid
            viewCount
            videoRatio
            stereoType
            musicBlocked
            manifest {
              mediaType
              businessType
              version
              adaptationSet {
                id
                duration
                representation {
                  id
                  defaultSelect
                  backupUrl
                  codecs
                  url
                  height
                  width
                  avgBitrate
                  maxBitrate
                  m3u8Slice
                  qualityType
                  qualityLabel
                  frameRate
                  featureP2sp
                  hidden
                  disableAdaptive
                  __typename
                }
                __typename
              }
              __typename
            }
            manifestH265
            photoH265Url
            coronaCropManifest
            coronaCropManifestH265
            croppedPhotoH265Url
            croppedPhotoUrl
            videoResource
            __typename
          }
          tags {
            type
            name
            __typename
          }
          commentLimit {
            canAddComment
            __typename
          }
          llsid
          danmakuSwitch
          __typename
        }
      }
    `;

    return this.sendGraphQLRequest('visionVideoDetail', { 
      photoId, 
      type: "feed",
      page: "detail",
      webPageArea: "" 
    }, query);
  }

  /**
   * 获取视频评论
   * @param {string} photoId 视频ID
   * @param {string} pcursor 分页游标
   * @returns {Promise<object>} 评论列表
   */
  async getVideoComments(photoId, pcursor = '') {
    try {
      console.log(`获取视频 ${photoId} 的评论，游标: ${pcursor || '起始'}`);
      
      const query = `
        query commentListQuery($photoId: String, $pcursor: String) {
          visionCommentList(photoId: $photoId, pcursor: $pcursor) {
            commentCount
            pcursor
            rootComments {
              commentId
              authorId
              authorName
              content
              headurl
              timestamp
              likedCount
              realLikedCount
              liked
              status
              authorLiked
              subCommentCount
              subCommentsPcursor
              subComments {
                commentId
                authorId
                authorName
                content
                headurl
                timestamp
                likedCount
                realLikedCount
                liked
                status
                authorLiked
                replyToUserName
                replyTo
                __typename
              }
              __typename
            }
            __typename
          }
        }
      `;
      
      const result = await this.sendGraphQLRequest('commentListQuery', { photoId, pcursor }, query);
      
      // 处理结果
      if (result && result.visionCommentList) {
        return result.visionCommentList;
      }
      
      return null;
    } catch (error) {
      console.error(`获取视频评论失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取用户主页信息
   * @param {string} userId 用户ID
   * @returns {Promise<object>} 用户主页信息
   */
  async getUserProfile(userId) {
    const query = `
      query userProfile($userId: String) {
        userProfile(userId: $userId) {
          ownerCount {
            fan
            follow
            photo
            liked
          }
          profile {
            gender
            user {
              id
              eid
              name
              avatar
              isFollowing
              isFollower
              isBlocking
              blockStatus
              following
              living
            }
          }
        }
      }
    `;

    return this.sendGraphQLRequest('userProfile', { userId }, query);
  }

  /**
   * 获取用户视频列表
   * @param {string} userId 用户ID
   * @param {string} pcursor 分页游标
   * @returns {Promise<object>} 视频列表
   */
  async getUserVideos(userId, pcursor = '') {
    try {
      console.log(`获取用户 ${userId} 的视频列表，游标: ${pcursor || '起始'}`);
      
      const query = `
        fragment photoContent on PhotoEntity {
          __typename
          id
          duration
          caption
          originCaption
          likeCount
          viewCount
          commentCount
          realLikeCount
          coverUrl
          photoUrl
          photoH265Url
          manifest
          manifestH265
          videoResource
          coverUrls {
            url
            __typename
          }
          timestamp
          expTag
          animatedCoverUrl
          distance
          videoRatio
          liked
          stereoType
          profileUserTopPhoto
          musicBlocked
          riskTagContent
          riskTagUrl
        }

        fragment recoPhotoFragment on recoPhotoEntity {
          __typename
          id
          duration
          caption
          originCaption
          likeCount
          viewCount
          commentCount
          realLikeCount
          coverUrl
          photoUrl
          photoH265Url
          manifest
          manifestH265
          videoResource
          coverUrls {
            url
            __typename
          }
          timestamp
          expTag
          animatedCoverUrl
          distance
          videoRatio
          liked
          stereoType
          profileUserTopPhoto
          musicBlocked
          riskTagContent
          riskTagUrl
        }

        fragment feedContent on Feed {
          type
          author {
            id
            name
            headerUrl
            following
            headerUrls {
              url
              __typename
            }
            __typename
          }
          photo {
            ...photoContent
            ...recoPhotoFragment
            __typename
          }
          canAddComment
          llsid
          status
          currentPcursor
          tags {
            type
            name
            __typename
          }
          __typename
        }

        query visionProfilePhotoList($pcursor: String, $userId: String, $page: String, $webPageArea: String) {
          visionProfilePhotoList(pcursor: $pcursor, userId: $userId, page: $page, webPageArea: $webPageArea) {
            result
            llsid
            webPageArea
            feeds {
              ...feedContent
              __typename
            }
            hostName
            pcursor
            __typename
          }
        }
      `;

      const result = await this.sendGraphQLRequest('visionProfilePhotoList', { 
        userId, 
        pcursor, 
        page: "profile",
        webPageArea: "profile" 
      }, query);
      
      // 处理结果
      if (result && result.visionProfilePhotoList) {
        const { feeds, pcursor: nextCursor } = result.visionProfilePhotoList;
        
        // 提取视频列表
        const photoList = feeds ? feeds.map(feed => feed.photo) : [];
        
        // 返回处理后的结果
        return {
          visionProfilePhotoList: {
            pcursor: nextCursor,
            photoList
          }
        };
      }
      
      return null;
    } catch (error) {
      console.error(`获取用户视频列表失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 直接使用API获取用户信息（测试用，不需要完整登录）
   * @param {string} userId 用户ID
   * @returns {Promise<object>} 用户信息
   */
  async testGetUserProfile(userId) {
    try {
      console.log(`直接通过API测试获取用户 ${userId} 信息...`);
      
      const query = `
        query visionProfile($userId: String) {
          visionProfile(userId: $userId) {
            result
            hostName
            userProfile {
              ownerCount {
                fan
                photo
                follow
                photo_public
              }
              profile {
                gender
                user_name
                user_id
                headurl
                user_text
                user_profile_bg_url
              }
              isFollowing
            }
          }
        }
      `;
      
      const result = await this.sendGraphQLRequest('visionProfile', { userId }, query);
      
      // 添加更详细的调试信息
      if (result) {
        console.log('visionProfile响应:', JSON.stringify(result, null, 2));
        
        // 修复数据结构处理逻辑
        if (result.visionProfile) {
          // 检查result字段，快手API通常使用result字段表示状态
          if (result.visionProfile.result === 1) {
            if (result.visionProfile.userProfile) {
              console.log('成功获取用户信息');
              return result.visionProfile.userProfile;
            } else {
              console.log('用户信息为空');
            }
          } else {
            console.log(`获取用户信息失败，状态码: ${result.visionProfile.result}`);
          }
        } else {
          console.log('响应数据结构不符合预期');
        }
      } else {
        console.log('API请求返回空结果');
      }
      
      console.log(`用户 ${userId} 不存在或获取失败`);
      return null;
    } catch (error) {
      console.error(`测试获取用户信息失败: ${error.message}`);
      return null;
    }
  }
}

module.exports = KuaiShouClient; 