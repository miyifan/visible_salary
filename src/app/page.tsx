"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UserSettings {
  salary: number;
  salaryMonths: number;
  workHoursPerDay: number;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  workDays: number[]; // 0 for Sunday, 1 for Monday, ...
}

// 假日 API 接口
interface HolidayInfoFromAPI {
  date: string; // "YYYY-MM-DD"
  lunarDate: string;
  weekDay: number; // 1-7 (Mon-Sun)
  status: number; // 1: work, 2: day off
  festival?: string;
  badDay?: number; // 1: makeup work day
  description?: string;
  statutory?: number; // 1: statutory holiday
}

interface HolidayApiResponse {
  code: number;
  data: HolidayInfoFromAPI[];
  msg: string;
}

interface ProcessedDayOff {
  date: Date;
  name: string;
  isStatutoryHoliday: boolean;
}

// 语言类型
type Language = 'zh' | 'en' | 'ja';

// 货币符号映射
const currencySymbols: Record<Language, string> = {
  zh: '¥',
  en: '$',
  ja: '¥'
};

// 文本翻译对象
const translations: Record<string, Record<Language, string>> = {
  settings: { zh: '设置', en: 'Settings', ja: '設定' },
  earnedToday: { zh: '今天已赚', en: 'Earned Today', ja: '今日の稼ぎ' },
  workingNow: { zh: '正在努力搬砖中...', en: 'Working hard...', ja: '頑張って働いています...' },
  notWorkingYet: { zh: '还没到上班时间', en: 'Not work time yet', ja: 'まだ勤務時間ではありません' },
  workOver: { zh: '今日已打烊', en: 'Work finished for today', ja: '今日の勤務は終了しました' },
  dayOff: { zh: '今天休息', en: 'Day off today', ja: '今日は休みです' },
  weekend: { zh: '周末', en: 'Weekend', ja: '週末' },
  timeUntilOff: { zh: '还有', en: 'Time until off', ja: '退勤まで' },
  timeOff: { zh: '下班', en: 'off work', ja: '退勤' },
  endTimeLabel: { zh: '下班时间', en: 'End time', ja: '退勤時間' },
  workDaysLabel: { zh: '工作日', en: 'Workdays', ja: '勤務日' },
  workHoursLabel: { zh: '每日工作', en: 'Daily work', ja: '毎日の勤務' },
  hours: { zh: '小时', en: 'hours', ja: '時間' },
  currentDate: { zh: '当前日期', en: 'Current Date', ja: '現在の日付' },
  daysUntilWeekend: { zh: '距离下一个周末还有', en: 'Days until weekend', ja: '週末まであと' },
  days: { zh: '天', en: 'days', ja: '日' },
  loading: { zh: '正在加载节假日信息...', en: 'Loading...', ja: '読み込み中...' },
  salary: { zh: '月工资', en: 'Monthly Salary', ja: '月給' },
  salaryMonths: { zh: '一年几薪', en: 'Salary Months per Year', ja: '年間の給料月数' },
  workHoursPerDay: { zh: '每日上班时长 (小时)', en: 'Work Hours per Day', ja: '1日の勤務時間 (時間)' },
  startTime: { zh: '上班时间', en: 'Start Time', ja: '出勤時間' },
  endTime: { zh: '下班时间', en: 'End Time', ja: '退勤時間' },
  weekDays: { zh: '每周工作日', en: 'Workdays', ja: '勤務日' },
  saveSettings: { zh: '保存设置', en: 'Save Settings', ja: '設定を保存' },
  cancel: { zh: '暂不设置', en: 'Cancel', ja: 'キャンセル' },
  firstTimeSetup: { zh: '使用设置', en: 'Setup', ja: '設定' },
  pleaseSetup: { zh: '请先设置您的工资信息', en: 'Please set up your salary information', ja: '給料情報を設定してください' },
  openSettings: { zh: '打开设置', en: 'Open Settings', ja: '設定を開く' },
  workFinished: { zh: '已下班', en: 'Work finished for today', ja: '今日の勤務は終了しました' },
  minutes: { zh: '分钟', en: 'minutes', ja: '分' },
};

export default function Home() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [earnedToday, setEarnedToday] = useState(0);
  const [isWorkingTime, setIsWorkingTime] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [language, setLanguage] = useState<Language>('zh');
  const [showLangDropdown, setShowLangDropdown] = useState(false);

  const [tempSalary, setTempSalary] = useState("");
  const [tempSalaryMonths, setTempSalaryMonths] = useState("12");
  const [tempWorkHoursPerDay, setTempWorkHoursPerDay] = useState("8");
  const [tempStartTime, setTempStartTime] = useState("09:00");
  const [tempEndTime, setTempEndTime] = useState("18:00");
  const [tempWorkDays, setTempWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // 节假日相关状态
  const [allFetchedHolidayData, setAllFetchedHolidayData] = useState<HolidayInfoFromAPI[]>([]);
  const [upcomingDaysOff, setUpcomingDaysOff] = useState<ProcessedDayOff[]>([]);
  const [nextDayOffDisplay, setNextDayOffDisplay] = useState<{ name: string; daysUntil: number } | null>(null);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
  
  // 使用ref存储上一次时间，避免不必要的渲染
  const lastUpdateTimeRef = useRef(new Date());
  const currentTimeRef = useRef(new Date());

  // 文本翻译函数 - 使用useRef存储翻译函数，避免在每次渲染时重建
  const tRef = useRef<(key: string) => string>(() => "");

  // 更新翻译函数
  useEffect(() => {
    tRef.current = (key: string): string => {
      return translations[key]?.[language] || key;
    };
  }, [language]);

  // 使用tRef.current替代t
  const t = tRef.current;

  // 切换语言函数
  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("salaryAppLanguage", lang);
    setShowLangDropdown(false); // 选择后关闭下拉菜单
  };

  // 计算到下一个周末的天数
  const getDaysUntilWeekend = (): number => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = 周日, 6 = 周六
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 0; // 今天就是周末
    }
    
    // 计算到周六的天数
    return 6 - dayOfWeek;
  };

  // 计算距离下班还有多久
  function getTimeUntilOffWork(settings: UserSettings): string {
    const now = new Date();
    const [endHour, endMinute] = settings.endTime.split(":").map(Number);
    const end = new Date(now);
    end.setHours(endHour, endMinute, 0, 0);
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return t('workFinished');
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (h > 0) return `${h} ${t('hours')} ${m} ${t('minutes')}`;
    return `${m} ${t('minutes')}`;
  }

  // 计算上下班时间差（小时，保留一位小数）
  function calcWorkHours(start: string, end: string) {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60; // 跨天
    return (diff / 60).toFixed(1);
  }

  // 格式化时间
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("zh-CN", { hour12: false });
  };

  // 生成星期组件
  const getWeekDayNames = (lang: Language) => {
    if (lang === 'zh') {
      return ["日", "一", "二", "三", "四", "五", "六"]; 
    } else if (lang === 'en') {
      return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    } else { // 日语
      return ["日", "月", "火", "水", "木", "金", "土"]; 
    }
  };

  const weekDays = getWeekDayNames(language);
  
  // 加载节假日数据
  useEffect(() => {
    const fetchHolidays = async () => {
      setIsLoadingHolidays(true);
      const currentYear = new Date().getFullYear();
      const yearsToFetch = [currentYear, currentYear + 1];
      let fetchedData: HolidayInfoFromAPI[] = [];

      try {
        // 添加超时保护
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
        
        for (const year of yearsToFetch) {
          try {
            const response = await fetch(
              `https://oneapi.coderbox.cn/openapi/public/holiday?date=${year}&queryType=2`, 
              { signal: controller.signal }
            );
            
            if (!response.ok) {
              console.error(`Failed to fetch holidays for ${year}: ${response.statusText}`);
              continue;
            }
            
            const result: HolidayApiResponse = await response.json();
            if (result.code === 0 && result.data) {
              fetchedData = fetchedData.concat(result.data);
            } else {
              console.error(`API error for ${year} (${result.code}): ${result.msg}`);
            }
          } catch (err) {
            console.error(`Error fetching holidays for ${year}:`, err);
          }
        }
        
        clearTimeout(timeoutId);
        setAllFetchedHolidayData(fetchedData);
      } catch (error) {
        console.error("Error fetching holiday data:", error);
        setAllFetchedHolidayData([]);
      } finally {
        setIsLoadingHolidays(false);
      }
    };

    // 只在中文模式下加载节假日
    if (language === 'zh') {
      fetchHolidays();
    } else {
      setIsLoadingHolidays(false);
    }
  }, [language]);

  // 加载用户设置
  useEffect(() => {
    const storedSettings = localStorage.getItem("salaryAppSettings");
    if (storedSettings) {
      setSettings(JSON.parse(storedSettings));
    } else {
      setShowModal(true);
    }
    
    // 读取保存的语言设置
    const storedLanguage = localStorage.getItem("salaryAppLanguage");
    if (storedLanguage && (storedLanguage === 'zh' || storedLanguage === 'en' || storedLanguage === 'ja')) {
      setLanguage(storedLanguage as Language);
    }
  }, []);

  // 判断某天的休息类型："法定假日" | "周末" | "休息日" | null
  function getDayOffType(date: Date, settings: UserSettings, allFetchedHolidayData: HolidayInfoFromAPI[]): string | null {
    const ymd = date.toISOString().split('T')[0];
    const apiInfo = allFetchedHolidayData.find(d => d.date === ymd);
    const jsDay = date.getDay(); // 0=周日, 6=周六
    // 1. 法定假日优先
    if (apiInfo && (apiInfo.statutory || apiInfo.festival) && apiInfo.status === 2) {
      return apiInfo.festival || "法定假日";
    }
    // 2. 调休上班
    if (apiInfo && apiInfo.status === 1) {
      return null;
    }
    // 3. 传统周末且未被选为工作日
    if ((jsDay === 0 || jsDay === 6) && !settings.workDays.includes(jsDay)) {
      return "周末";
    }
    // 4. 其它未被选为工作日的休息日
    if (!settings.workDays.includes(jsDay)) {
      return "休息日";
    }
    return null;
  }

  // 获取下一个休息日
  function getNextDayOff(settings: UserSettings, allFetchedHolidayData: HolidayInfoFromAPI[]): { name: string, daysUntil: number } | null {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let nextHoliday: { name: string, daysUntil: number } | null = null;
    let nextRest: { name: string, daysUntil: number } | null = null;
    // 查找未来90天
    for (let i = 1; i <= 90; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const ymd = d.toISOString().split('T')[0];
      const apiInfo = allFetchedHolidayData.find(x => x.date === ymd);
      const jsDay = d.getDay();
      // 1. 法定节假日（且不是调休上班）
      if (!nextHoliday && apiInfo && (apiInfo.statutory || apiInfo.festival) && apiInfo.status === 2) {
        nextHoliday = { name: apiInfo.festival || "法定假日", daysUntil: i };
      }
      // 2. 用户设置的休息日
      if (!nextRest && !settings.workDays.includes(jsDay)) {
        if (jsDay === 0 || jsDay === 6) {
          nextRest = { name: "周末", daysUntil: i };
        } else {
          nextRest = { name: "休息日", daysUntil: i };
        }
      }
      // 如果都找到了，提前结束
      if (nextHoliday && nextRest) break;
    }
    // 谁更近显示谁
    if (nextHoliday && nextRest) {
      return nextHoliday.daysUntil <= nextRest.daysUntil ? nextHoliday : nextRest;
    }
    return nextHoliday || nextRest;
  }

  // 处理休息日数据
  useEffect(() => {
    if (isLoadingHolidays || !settings) {
      setUpcomingDaysOff([]);
      setNextDayOffDisplay(null);
      return;
    }
    
    // 生成未来90天的休息日列表
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const processedDays: ProcessedDayOff[] = [];
    
    for (let i = 0; i < 90; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const jsDay = d.getDay();
      const ymd = d.toISOString().split('T')[0];
      const apiInfo = allFetchedHolidayData.find(x => x.date === ymd);
      
      // 法定节假日
      if (apiInfo && (apiInfo.statutory || apiInfo.festival) && apiInfo.status === 2) {
        processedDays.push({ date: new Date(d), name: apiInfo.festival || "法定假日", isStatutoryHoliday: true });
      } 
      // 用户设置的休息日
      else if (!settings.workDays.includes(jsDay)) {
        processedDays.push({ 
          date: new Date(d), 
          name: (jsDay === 0 || jsDay === 6) ? "周末" : "休息日", 
          isStatutoryHoliday: false 
        });
      }
    }
    
    setUpcomingDaysOff(processedDays);
    
    // 计算下一个休息日
    if (processedDays.length > 0) {
      const nextOff = processedDays[0];
      const diffTime = nextOff.date.getTime() - today.getTime(); 
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      setNextDayOffDisplay({ name: nextOff.name, daysUntil: diffDays });
    } else {
      setNextDayOffDisplay(null);
    }
  }, [settings, allFetchedHolidayData, isLoadingHolidays]);

  // 计算某月实际工作日天数
  function getActualWorkDaysOfMonth(year: number, month: number, settings: UserSettings, allFetchedHolidayData: HolidayInfoFromAPI[]): number {
    // month: 1-12
    const daysInMonth = new Date(year, month, 0).getDate();
    let restDays = 0;
    let holidayDays = 0;
    let makeupWorkDays = 0;
    
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const ymd = date.toISOString().split('T')[0];
      const jsDay = date.getDay();
      const apiInfo = allFetchedHolidayData.find(x => x.date === ymd);
      
      // 休息日（用户未选为工作日，且不是调休上班）
      if (!settings.workDays.includes(jsDay) && !(apiInfo && apiInfo.status === 1 && apiInfo.badDay === 1)) {
        restDays++;
      }
      // 法定节假日
      if (apiInfo && apiInfo.status === 2 && apiInfo.statutory === 1) {
        holidayDays++;
      }
      // 调休上班
      if (apiInfo && apiInfo.status === 1 && apiInfo.badDay === 1) {
        makeupWorkDays++;
      }
    }
    
    return daysInMonth - restDays - holidayDays + makeupWorkDays;
  }

  // 计算今天收入
  const calculateEarnings = useCallback(() => {
    if (!settings) return;

    const now = new Date();
    
    // 将当前时间存到 ref 中
    currentTimeRef.current = now;
    
    // 只有当秒数变化时才更新 state，减少渲染
    if (now.getSeconds() !== lastUpdateTimeRef.current.getSeconds()) {
      setCurrentTime(now);
      lastUpdateTimeRef.current = now;
    }

    const todayYMD = now.toISOString().split('T')[0];
    const todayApiInfo = allFetchedHolidayData.find(d => d.date === todayYMD);

    const jsGetDay = now.getDay(); // JS: 0=Sun, 1=Mon, ..., 6=Sat
    let isTodayActuallyWorkDay = false;
    let dayOffReason = "";

    // 非中文模式使用简单的工作日逻辑
    if (language !== 'zh') {
      if (settings.workDays.includes(jsGetDay)) {
        isTodayActuallyWorkDay = true;
      } else {
        isTodayActuallyWorkDay = false;
        dayOffReason = t('dayOff');
      }
    } 
    // 中文模式使用完整的节假日逻辑
    else {
      // Priority 1: API says it's a statutory/festival OFF day.
      if (todayApiInfo && (todayApiInfo.statutory || todayApiInfo.festival) && todayApiInfo.status === 2) {
        isTodayActuallyWorkDay = false;
        dayOffReason = `今天是${todayApiInfo.festival || '法定假日'} 🏖️`;
      }
      // Priority 2: API says it's a WORK day (调休上班).
      else if (todayApiInfo && todayApiInfo.status === 1) {
        isTodayActuallyWorkDay = true;
      }
      // Priority 3: Not an API-forced holiday/workday, so user's schedule decides.
      else {
        if (settings.workDays.includes(jsGetDay)) {
          isTodayActuallyWorkDay = true;
        } else {
          isTodayActuallyWorkDay = false;
          let specificReason = "(按您的排班)";
          if (todayApiInfo && todayApiInfo.status === 2) { // API agrees it's an off-day (e.g. normal weekend)
              specificReason = `(${(jsGetDay === 0 || jsGetDay === 6) ? '周末' : '休息日'}, 按您的排班) 🏖️`;
          }
          dayOffReason = `今天不是工作日 ${specificReason}`;
        }
      }
    }

    if (!isTodayActuallyWorkDay) {
      setIsWorkingTime(false);
      setStatusMessage(dayOffReason || `${t('dayOff')} 🏖️`); // Fallback message if reason is empty
      setEarnedToday(0);
      return;
    }

    // If we reach here, it IS a workday.
    const annualSalary = settings.salary * settings.salaryMonths;
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;
    
    // 获取工作日数量（简化非中文模式的计算）
    let monthWorkDays;
    if (language === 'zh') {
      monthWorkDays = getActualWorkDaysOfMonth(nowYear, nowMonth, settings, allFetchedHolidayData);
    } else {
      // 简单计算一个月的工作日（仅考虑用户设置的工作日）
      const daysInMonth = new Date(nowYear, nowMonth, 0).getDate();
      monthWorkDays = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dayOfWeek = new Date(nowYear, nowMonth - 1, d).getDay();
        if (settings.workDays.includes(dayOfWeek)) {
          monthWorkDays++;
        }
      }
    }
    
    if (monthWorkDays === 0 || settings.workHoursPerDay <= 0) {
      setIsWorkingTime(false);
      setStatusMessage("未设置有效工作日或工作时长");
      setEarnedToday(0);
      return;
    }
    
    const salaryPerSecond = settings.salary * settings.salaryMonths / (12 * monthWorkDays * settings.workHoursPerDay * 3600);
    const totalWorkSecondsInDay = settings.workHoursPerDay * 3600;

    const [startHour, startMinute] = settings.startTime.split(":").map(Number);
    const [endHour, endMinute] = settings.endTime.split(":").map(Number);

    const workStartTime = new Date(now);
    workStartTime.setHours(startHour, startMinute, 0, 0);

    const workEndTime = new Date(now);
    workEndTime.setHours(endHour, endMinute, 0, 0);

    if (now < workStartTime) {
      setIsWorkingTime(false);
      setStatusMessage(`${t('notWorkingYet')} 🧘`);
      setEarnedToday(0);
      return;
    }

    if (now >= workEndTime) {
      setIsWorkingTime(false);
      setStatusMessage(`${t('workOver')} 🎉`);
      setEarnedToday(salaryPerSecond * totalWorkSecondsInDay);
      return;
    }

    setIsWorkingTime(true);
    setStatusMessage(`${t('workingNow')} 🧱`);
    const secondsWorkedToday = (now.getTime() - workStartTime.getTime()) / 1000;
    const currentEarnings = salaryPerSecond * secondsWorkedToday;
    setEarnedToday(Math.min(currentEarnings, totalWorkSecondsInDay * salaryPerSecond));
  }, [settings, allFetchedHolidayData, language, t]);

  // 定时更新收入
  useEffect(() => {
    if (settings) {
      calculateEarnings(); // 初始计算
      const intervalId = setInterval(calculateEarnings, 100); 
      return () => clearInterval(intervalId);
    }
  }, [settings, calculateEarnings]);

  // 保存设置
  const handleSaveSettings = () => {
    const newSettings: UserSettings = {
      salary: parseFloat(tempSalary) || 0,
      salaryMonths: parseInt(tempSalaryMonths) || 12,
      workHoursPerDay: parseFloat(tempWorkHoursPerDay) || 8,
      startTime: tempStartTime,
      endTime: tempEndTime,
      workDays: tempWorkDays.sort((a, b) => a - b),
    };
    
    if (newSettings.salary <= 0 || newSettings.workHoursPerDay <= 0 || newSettings.workDays.length === 0) {
      alert("请输入有效的工资、每日工作时长并至少选择一个工作日。");
      return;
    }
    
    localStorage.setItem("salaryAppSettings", JSON.stringify(newSettings));
    setSettings(newSettings);
    setShowModal(false);
  };

  // 切换工作日选择
  const handleDayToggle = (day: number) => {
    setTempWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a,b)=>a-b)
    );
  };

  // 渲染设置模态框
  const renderSettingsModal = () => {
    if (!showModal) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 p-6 md:p-8 rounded-lg shadow-[0px_5px_0px_0px_rgb(0,0,0)] w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <h2 className="text-2xl font-semibold mb-6 text-center text-sky-400">{t('firstTimeSetup')}</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="salary" className="block text-sm font-medium text-slate-300 mb-1">{t('salary')} ({currencySymbols[language]}):</label>
              <input type="number" id="salary" value={tempSalary} onChange={(e) => setTempSalary(e.target.value)} className="w-full p-2 rounded bg-slate-700 border border-slate-600 focus:ring-sky-500 focus:border-sky-500" placeholder="例如: 10000" />
            </div>
            <div>
              <label htmlFor="salaryMonths" className="block text-sm font-medium text-slate-300 mb-1">{t('salaryMonths')}:</label>
              <input type="number" id="salaryMonths" value={tempSalaryMonths} onChange={(e) => setTempSalaryMonths(e.target.value)} className="w-full p-2 rounded bg-slate-700 border border-slate-600 focus:ring-sky-500 focus:border-sky-500" placeholder="例如: 12" />
            </div>
            <div>
              <label htmlFor="workHoursPerDay" className="block text-sm font-medium text-slate-300 mb-1">{t('workHoursPerDay')}:</label>
              <input type="number" id="workHoursPerDay" value={calcWorkHours(tempStartTime, tempEndTime)} readOnly className="w-full p-2 rounded bg-slate-700 border border-slate-600 text-slate-400 cursor-not-allowed" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="startTime" className="block text-sm font-medium text-slate-300 mb-1">{t('startTime')}:</label>
                <input
                  type="time"
                  id="startTime"
                  value={tempStartTime}
                  onChange={e => setTempStartTime(e.target.value)}
                  className="w-full h-9 text-base font-bold text-center bg-slate-800 text-white rounded-lg border border-slate-600 focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition-all shadow-md cursor-pointer"
                  step="60"
                />
              </div>
              <div>
                <label htmlFor="endTime" className="block text-sm font-medium text-slate-300 mb-1">{t('endTime')}:</label>
                <input
                  type="time"
                  id="endTime"
                  value={tempEndTime}
                  onChange={e => setTempEndTime(e.target.value)}
                  className="w-full h-9 text-base font-bold text-center bg-slate-800 text-white rounded-lg border border-slate-600 focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition-all shadow-md cursor-pointer"
                  step="60"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">{t('weekDays')}:</label>
              <div className="flex flex-wrap gap-2">
                {weekDays.map((dayName, index) => (
                  <button
                    key={index}
                    onClick={() => handleDayToggle(index)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors
                      ${tempWorkDays.includes(index) ? 'bg-sky-500 text-white border-sky-500' : 'bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-300'}`}
                  >
                    {language === 'zh' ? `星期${dayName}` : language === 'en' ? dayName : `${dayName}曜日`}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleSaveSettings} className="mt-8 w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 px-4 rounded-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50">
            {t('saveSettings')}
          </button>
          <button onClick={() => {setShowModal(false); if(!settings) { alert("需要设置才能使用。");}}} className="mt-2 w-full bg-slate-600 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 px-4 rounded-lg transition duration-150 ease-in-out">
            {t('cancel')}
          </button>
        </div>
      </div>
    );
  };

  // 继续渲染主界面
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-900 to-slate-700 text-white relative">
      {/* 右上角控制面板 */}
      <div className="absolute top-4 right-4 z-10 flex items-center space-x-3">
        <button
          onClick={() => {
            if(settings) {
              setTempSalary(settings.salary.toString());
              setTempSalaryMonths(settings.salaryMonths.toString());
              setTempWorkHoursPerDay(settings.workHoursPerDay.toString());
              setTempStartTime(settings.startTime);
              setTempEndTime(settings.endTime);
              setTempWorkDays(settings.workDays);
            }
            setShowModal(true);
          }}
          className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium py-1.5 px-3 rounded-md transition duration-150 shadow-md"
        >
          {t('settings')}
        </button>
        
        {/* 语言切换按钮 */}
        <div className="relative">
          <button 
            onClick={() => setShowLangDropdown(!showLangDropdown)} 
            className="flex items-center px-2.5 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs transition-colors"
          >
            {language === 'zh' ? '中文' : language === 'en' ? 'English' : '日本語'}
            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>
          
          {showLangDropdown && (
            <div className="absolute right-0 mt-1 w-32 py-1 bg-slate-800 rounded-md shadow-lg z-50">
              <button 
                onClick={() => changeLanguage('zh')}
                className={`block w-full text-left px-4 py-2 text-xs ${language === 'zh' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                中文
              </button>
              <button 
                onClick={() => changeLanguage('en')}
                className={`block w-full text-left px-4 py-2 text-xs ${language === 'en' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                English
              </button>
              <button 
                onClick={() => changeLanguage('ja')}
                className={`block w-full text-left px-4 py-2 text-xs ${language === 'ja' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                日本語
              </button>
            </div>
          )}
        </div>
      </div>

      {renderSettingsModal()}

      {!settings && !showModal && (
        <div className="text-center">
          <p className="text-xl mb-4 text-slate-300">{t('pleaseSetup')}</p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition-transform transform hover:scale-105"
          >
            {t('openSettings')}
          </button>
        </div>
      )}

      {settings && (
        <div className="text-center w-full max-w-md p-6 bg-slate-800 bg-opacity-80 backdrop-blur-md rounded-xl shadow-[0px_5px_0px_0px_rgb(0,0,0)]">
          <div className="mb-2">
            <div className="relative">
              <p className="text-5xl md:text-6xl font-bold tracking-wider text-sky-300 tabular-nums">
                {formatTime(currentTime)}
              </p>
              
              {/* 节假日信息 */}
              <p className="text-xs text-slate-400 mt-1 h-4">
                {language !== 'zh' ? (
                  getDaysUntilWeekend() === 0 
                    ? t('weekend') 
                    : `${t('daysUntilWeekend')}: ${getDaysUntilWeekend()} ${t('days')}`
                ) : isLoadingHolidays ? (
                  t('loading')
                ) : nextDayOffDisplay ? (
                  nextDayOffDisplay.daysUntil === 0
                    ? <>今天就是 <span className="font-semibold text-sky-400">{nextDayOffDisplay.name}</span>！</>
                    : <>距离下一个休息日 <span className="font-semibold text-sky-400">{nextDayOffDisplay.name}</span> 还有 <span className="font-semibold text-sky-400">{nextDayOffDisplay.daysUntil}</span> {t('days')}</>
                ) : (
                  t('loading')
                )}
              </p>
            </div>
          </div>

          <div className="my-8">
            <p className="text-sm text-slate-400 mb-1">{t('earnedToday')}</p>
            <p className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-400 to-teal-500 tabular-nums">
              {currencySymbols[language]} {earnedToday.toFixed(3)}
            </p>
            <p className={`text-sm mt-2 h-5 font-medium ${isWorkingTime ? 'text-green-400' : 'text-amber-400'}`}>
              {statusMessage}
            </p>
          </div>
          
          <div className="text-xs text-slate-500 space-y-0.5">
            <p>
              {t('timeUntilOff')} <span className="font-semibold text-sky-400">{getTimeUntilOffWork(settings)}</span> {t('timeOff')}
              （{t('endTimeLabel')}: <span className="font-semibold text-sky-400">{settings.endTime}</span>）
            </p>
            <p>{t('workDaysLabel')}: {settings.workDays.map(d => language === 'zh' ? `周${weekDays[d]}` : language === 'en' ? weekDays[d] : `${weekDays[d]}曜日`).join(', ')}</p>
            <p>{t('workHoursLabel')}: {settings.workHoursPerDay} {t('hours')}</p>
          </div>
        </div>
      )}

      <footer className="absolute bottom-4 text-center text-xs text-slate-500 w-full px-4">
        <p>{t('currentDate')}: {new Date().toLocaleDateString(language === 'zh' ? "zh-CN" : language === 'en' ? "en-US" : "ja-JP")} {language === 'zh' ? `星期${weekDays[new Date().getDay()]}` : language === 'en' ? weekDays[new Date().getDay()] : `${weekDays[new Date().getDay()]}曜日`}</p>
      </footer>
    </main>
  );
}
