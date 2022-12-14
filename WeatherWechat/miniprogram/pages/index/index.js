//index.js
const app = getApp()
const config = app.globalData.config
const api = app.globalData.api
const loading = app.globalData.loading
const util = app.globalData.util
const COND_ICON_BASE_URL = config.COND_ICON_BASE_URL
const BG_IMG_BASE_URL = config.BG_IMG_BASE_URL
// 为了用`async await`
const wxCharts = require('../../lib/wxchart')
var mqtt = require('../../util/mqtt.min') //根据自己存放的路径修改
const crypto = require('../../util/hex_hmac_sha1'); //根据自己存放的路径修改
Page({
  data: {
    greetings: '' , // 问候语
    bgImgUrl: BG_IMG_BASE_URL + '/calm.jpg', // 背景图片地址
    location: '', // 地理坐标
    geoDes: '定位中...', // 地理位置描述
    text:[],
    nowWeather: { // 实时天气数据
      tmp: 'N/A', // 温度
      condTxt: '', // 天气状况
      windDir: '', // 风向
      windSc: '', // 风力
      windSpd: '', // 风速
      pres: '', // 大气压
      hum: '', // 湿度
      pcpn: '', // 降水量
      condIconUrl: `${COND_ICON_BASE_URL}/999.png`, // 天气图标
      loc: '', // 当地时间
      tm: '', //设备温度
      hm: '', //设备湿度
      uv:'', //设备紫外线等级
      ws:'', //设备风速
      voc:'', //设备挥发性气体
      CO2:'',//CO2浓度
      pm:'' //设备Pm2.5
    },

    days: ['今天', '明天', '后天'],

    canvasWidth: 0,

    canvasSrc: '',

    dailyWeather: [], // 逐日天气数据

    hourlyWeather: [], // 逐三小时天气数据

    lifestyle: [] // 生活指数
  },

  // 加载提示
  ...loading,

  onShow () {
    this.init()
    this.doConnect()
  },

  // 初始化
  init () {
    this.showLoading()
    this.initGreetings()
    this.initWeatherInfo()
  },

  // 允许分享
  onShareAppMessage () { },
  doConnect(){
    var that = this;
    const deviceConfig = {
      productKey: "a14YPyxSjfC",
      deviceName: "Station",
      deviceSecret: "e00464b350db0ac0cce75ce0dfdb9f63",
      regionId: "cn-shanghai"//根据自己的区域替换
    };
    const options = this.initMqttOptions(deviceConfig);
    console.log(options)
    //替换productKey为你自己的产品的（注意这里是wxs，不是wss，否则你可能会碰到ws不是构造函数的错误）
    const client = mqtt.connect('wxs://productKey.iot-as-mqtt.cn-shanghai.aliyuncs.com',options)
    client.on('connect', function () {
      console.log('连接服务器成功')
      //注意：订阅主题，替换productKey和deviceName(这里的主题可能会不一样，具体请查看控制台-产品详情-Topic 类列表下的可订阅主题)，并且确保改主题的权限设置为可订阅
      client.subscribe('/a14YPyxSjfC/Station/user/sub', function (err) {
        if (!err) {
           console.log('订阅成功！');
        }
      })
    })
	//接收消息监听
    client.on('message', function (topic, message) {
      // message is Buffer
      var text = message.toString();
      var arr = text.match(/\d+(.\d+)?/g);
      var tm = arr[7];
      var hm = arr[4];
      var uv = arr[1];
      var ws = arr[9];
      var voc = arr[8];
      var pm = arr[3];
      var CO2 = arr[6];
      that.setData({tm});
      that.setData({hm});
      that.setData({uv});
      that.setData({ws});
      that.setData({voc});
      that.setData({pm});
      that.setData({CO2});
     //关闭连接 client.end()
    })
  },
  //IoT平台mqtt连接参数初始化
 initMqttOptions(deviceConfig) {

    const params = {
      productKey: deviceConfig.productKey,
      deviceName: deviceConfig.deviceName,
      timestamp: Date.now(),
      clientId: Math.random().toString(36).substr(2),
    }
    //CONNECT参数
    const options = {
      keepalive: 7200, //60s
      clean: false, //cleanSession不保持持久会话
      protocolVersion: 4 //MQTT v3.1.1
    }
    //1.生成clientId，username，password
    options.password = this.signHmacSha1(params, deviceConfig.deviceSecret);
    options.clientId = `${params.clientId}|securemode=2,signmethod=hmacsha1,timestamp=${params.timestamp}|`;
    options.username = `${params.deviceName}&${params.productKey}`;

    return options;
  },
  signHmacSha1(params, deviceSecret) {

    let keys = Object.keys(params).sort();
    // 按字典序排序
    keys = keys.sort();
    const list = [];
    keys.map((key) => {
      list.push(`${key}${params[key]}`);
    });
    const contentStr = list.join('');
    return crypto.hex_hmac_sha1(deviceSecret, contentStr);
  },
  // 跳到搜索页
  toSearchPage () {
    wx.navigateTo({
      url: '/pages/searchGeo/searchGeo'
    })
  },

  // 下拉刷新
  onPullDownRefresh () {
    this.init()
    wx.stopPullDownRefresh()
  },

  // 初始化问候语
  initGreetings () {
    this.setData({
      greetings: util.getGreetings()
    })
  },

  // 初始化天气信息
  async initWeatherInfo () {
    // 获取地址信息
    await this.getLocation()

    // 获取实时天气
    await this.getNowWeather()

    // 获取逐日天气
    await this.getDailyWeather()

    // 获取逐三小时天气
    await this.getHourlyWeather()

    // 获取生活指数
    await this.getLifestyle()

    // 关闭加载框
    await this.hideLoading()
  },

  // 获取地理位置信息
  async getLocation () {
    let position = wx.getStorageSync('POSITION')
    position = position ? JSON.parse(position) : position

    if (position) {
      this.setData({
        location: `${position.longitude},${position.latitude}`,
        geoDes: position.title
      })
      return;
    }

    await api.getLocation()
      .then((res) => {
        let { longitude, latitude } = res
        this.setData({
          location: `${longitude},${latitude}`
        })
        // 逆地址获取地址描述
        this.getGeoDes({
          longitude,
          latitude
        })
      })
      .catch((err) => {
        console.error(err)
      })
  },

  // 逆地址获取地址描述
  getGeoDes (option) {
    api.reverseGeocoder(option).then((res) => {
      let addressComponet = res.address_component
      let geoDes = `${addressComponet.city}${addressComponet.district}${addressComponet.street_number}`
      this.setData({
        geoDes
      })
    })
  },

  // 获取实时天气
  getNowWeather () {
    return new Promise((resolve, reject) => {
      api.getNowWeather({
        location: this.data.location
      })
        .then((res) => {
          let data = res.HeWeather6[0]
          this.formatNowWeather(data)
          this.initBgImg(data.now.cond_code)
          resolve()
        })
        .catch((err) => {
          console.error(err)
          reject(err)
        })
    })
  },

  // 格式化实时天气数据
  formatNowWeather (data) {
    this.setData({
      nowWeather: {
        parentCity: data.basic.parent_city,
        location: data.basic.location,
        tmp: data.now.tmp,
        condTxt: data.now.cond_txt,
        windDir: data.now.wind_dir,
        windSc: data.now.wind_sc,
        windSpd: data.now.wind_spd,
        pres: data.now.pres,
        hum: data.now.hum,
        pcpn: data.now.pcpn,
        condIconUrl: `${COND_ICON_BASE_URL}/${data.now.cond_code}.png`,
        loc: data.update.loc.slice(5).replace(/-/, '/')
      }
    })
  },

  // 初始化背景（导航和内容）
  initBgImg (code) {
    let cur = config.bgImgList.find((item) => {
      return item.codes.includes(parseInt(code))
    })
    let url = BG_IMG_BASE_URL + (cur ? `/${cur.name}` : '/calm') + '.jpg'

    this.setData({
      bgImgUrl: url
    })

    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: cur.color,
      animation: {
        duration: 400,
        timingFunc: 'easeIn'
      }
    })
  },

  // 获取逐日天气
  getDailyWeather () {
    return new Promise((resolve, reject) => {
      api.getDailyWeather({
        location: this.data.location
      })
        .then((res) => {
          let data = res.HeWeather6[0].daily_forecast
          this.formatDailyWeather(data)
          this.getDailyContainer()
          resolve()
        })
        .catch((err) => {
          console.error(err)
          reject(err)
        })
    })
  },

  // 格式化逐日天气数据
  formatDailyWeather (data) {
    let dailyWeather = data.reduce((pre, cur, index) => {
      let date = cur.date.slice(5).replace(/-/, '/')

      pre.push({
        date: date,
        parseDate: this.data.days[index] ? this.data.days[index] : date,
        condDIconUrl: `${COND_ICON_BASE_URL}/${cur.cond_code_d}.png`, //白天天气状况图标
        condNIconUrl: `${COND_ICON_BASE_URL}/${cur.cond_code_n}.png`, //晚间天气状况图标
        condTxtD: cur.cond_txt_d, // 白天天气状况描述
        condTxtN: cur.cond_txt_n, // 晚间天气状况描述
        sr: cur.sr, // 日出时间
        ss: cur.ss, // 日落时间
        tmpMax: cur.tmp_max, // 最高温度
        tmpMin: cur.tmp_min, // 最低气温
        windDir: cur.wind_dir, // 风向
        windSc: cur.wind_sc, // 风力
        windSpd: cur.wind_spd, // 风速
        pres: cur.pres, // 大气压
        vis: cur.vis // 能见度
      })

      return pre
    }, [])

    this.setData({
      dailyWeather
    })
  },

  // 获取逐日天气容器宽
  getDailyContainer () {
    let temperatureData = this.formatTemperatureData(this.data.dailyWeather)

    wx.createSelectorQuery().select('.forecast-day')
    .fields({
      size: true
    }).exec((res) => {
      this.drawTemperatureLine({
        temperatureData,
        diagramWidth: res[0].width * 7
      })
    })
  },

  // 绘制气温折线图
  drawTemperatureLine (data) {
    let {temperatureData, diagramWidth} = data
    let rate = wx.getSystemInfoSync().windowWidth / 375

    // 设置绘制 canvas 宽度
    this.setData({
      canvasWidth: diagramWidth
    })

    new wxCharts({
      canvasId: 'canvasWeather',
      type: 'line',
      categories: temperatureData.dateArr,
      animation: false,
      config: {
        fontSize: 16 * rate,
        color: "#ffffff",
        paddingX: 0,
        paddingY: 30 * rate
      },
      series: [{
        name: '最高气温',
        data: temperatureData.tmpMaxArr,
        fontOffset: -8 * rate,
        format: function (val, name) {
          return val + '℃'
        }
      }, {
        name: '最低气温',
        data: temperatureData.tmpMinArr,
        fontOffset: -8 * rate,
        format: function (val, name) {
          return val + '℃'
        }
      }],
      xAxis: {
        disableGrid: true
      },
      yAxis: {
        disabled: true
      },
      width: diagramWidth,
      height: 200,
      dataLabel: true,
      dataPointShape: true,
      extra: {
        lineStyle: 'curve'
      }
    })

    this.canvasToImg()
  },

  // 将 canvas 复制到图片
  canvasToImg () {
    setTimeout(() => {
      wx.canvasToTempFilePath({
        canvasId: 'canvasWeather',
        success: (res) => {
            var shareTempFilePath = res.tempFilePath;
            this.setData({
              canvasSrc: shareTempFilePath
            })
        }
      })
    }, 500)
  },

  // 格式化气温数据用于绘制折线图
  formatTemperatureData (data) {
    return data.reduce((pre, cur) => {
      let { date, tmpMax, tmpMin } = cur
      pre.dateArr.push(date)
      pre.tmpMaxArr.push(tmpMax)
      pre.tmpMinArr.push(tmpMin)
      return pre
    }, {dateArr: [], tmpMaxArr: [], tmpMinArr: []})
  },

  // 获取逐三小时天气
  getHourlyWeather () {
    return new Promise((resolve, reject) => {
      api.getHourlyWeather({
        location: this.data.location
      })
        .then((res) => {
          let data = res.HeWeather6[0].hourly
          this.formaHourlyWeather(data)
          resolve()
        })
        .catch((err) => {
          console.error(err)
          reject(err)
        })
    })
  },

  // 格式化逐三小时天气
  formaHourlyWeather (data) {
    let formatData = data.reduce((pre, cur) => {
      pre.push({
        date: cur.time.split(' ')[1],
        condIconUrl: `${COND_ICON_BASE_URL}/${cur.cond_code}.png`, // 天气图标
        condTxt: cur.cond_txt, // 天气状况描述
        tmp: cur.tmp, // 气温
        windDir: cur.wind_dir, // 风向
        windSc: cur.wind_sc, // 风力
        windSpd: cur.wind_spd, // 风速
        pres: cur.pres // 大气压
      })

      return pre
    }, [])

    let gap = 4
    let trip = Math.ceil(formatData.length / gap)
    let hourlyWeather = []
    for (let i = 0; i < trip; i++) {
      hourlyWeather.push(formatData.slice(i * gap, (i + 1) * gap))
    }

    this.setData({
      hourlyWeather
    })
  },

  // 获取生活指数
  getLifestyle () {
    return new Promise((resolve, reject) => {
      api.getLifestyle({
        location: this.data.location
      })
        .then((res) => {
          let data = res.HeWeather6[0].lifestyle
          this.formatLifestyle(data)
          resolve()
        })
        .catch((err) => {
          console.error(err)
          reject(err)
        })
    })
  },

  // 格式化生活指数数据
  formatLifestyle (data) {
    const lifestyleImgList = config.lifestyleImgList
    let lifestyle = data.reduce((pre, cur) => {
      pre.push({
        brf: cur.brf,
        txt: cur.txt,
        iconUrl: lifestyleImgList[cur.type].src,
        iconTxt: lifestyleImgList[cur.type].txt
      })
      return pre
    }, [])
    this.setData({
      lifestyle
    })
  }
})