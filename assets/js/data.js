/**
 * FJCU imMBA Official Website Data & i18n Translations
 * Top 10 Global Business School Editorial Content
 */

const imMBAData = {
  // Key Metrics / Highlights
  stats: [
    {
      id: 'aacsb',
      number: 'Top 5%',
      label_en: 'AACSB Accredited Worldwide',
      label_zh: '全球前 5% AACSB 國際商管認證',
      desc_en: 'Continuous accreditation since 2005 (2005, 2010, 2015, 2020, 2025)',
      desc_zh: '自 2005 年起持續通過認證 (2005, 2010, 2015, 2020, 2025)'
    },
    {
      id: 'ranking',
      number: 'Top 3',
      label_en: 'Taiwan Ranking (Eduniversal)',
      label_zh: 'Eduniversal 國際經營管理全台 Top 3',
      desc_en: 'Ranked Top 20 in Far East Asia by Eduniversal 2025',
      desc_zh: 'Eduniversal 2025 遠東地區 Top 20'
    },
    {
      id: 'bilingual',
      number: '100%',
      label_en: 'English-Taught Master Program',
      label_zh: '100% 全英語授課碩士課程',
      desc_en: 'MOE Key Bilingual Landmark College in Taiwan',
      desc_zh: '教育部「大專校院雙語學習計畫」重點培育學院'
    },
    {
      id: 'global',
      number: '100+',
      label_en: 'Global Partner Universities',
      label_zh: '100+ 所全球頂尖姊妹校交換',
      desc_en: 'Dual-degree programs & worldwide Catholic university network',
      desc_zh: '跨國雙碩士學位與耶穌會/天主教全球黃金人脈'
    }
  ],

  // Latest Announcements (最新公告 with authentic image thumbnails)
  announcements: [
    {
      id: '2689',
      top: true,
      category: 'admissions',
      category_en: 'Admissions',
      category_zh: '招生消息',
      title_en: '(imMBA) 2026/2027 Domestic Admission Registration: Sept 30 - Oct 13, 2026',
      title_zh: '(國際經管-全英MBA) 116學年度甄試招生報名：2026/09/30 - 10/13',
      date: '2026-08-19',
      image: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01779414963.jpg',
      summary_en: 'Online registration for 2026/2027 Domestic Recommendation Admission opens from Sept 30 (10:00) to Oct 13 (12:00). Oral interview details to be announced soon.',
      summary_zh: '116學年度碩士班甄試招生網路報名時間為 2026年09月30日10:00 至 10月13日12:00止。免筆試，歡迎大四及跨領域學生報考！',
      content_en: `
        <h4 class="font-serif text-lg font-bold mb-2">116 Academic Year Recommendation Admissions Notice</h4>
        <p class="mb-4">The International Master of Business Administration (imMBA) at Fu Jen Catholic University is inviting domestic applications for the upcoming academic year.</p>
        <ul class="list-disc pl-5 space-y-2 mb-4">
          <li><strong>Registration Window:</strong> Sept 30, 2026 (10:00) – Oct 13, 2026 (12:00)</li>
          <li><strong>Entrance Exam:</strong> Document Review (50%) + English Oral Interview (50%) — No Written Exam!</li>
          <li><strong>Required Documents:</strong> Document Review Form, ID Copy, Bachelor Diploma, Transcript, Autobiography & Study Plan, Recommendation Letter, English Proficiency Proof (TOEIC/TOEFL/IELTS).</li>
        </ul>
        <div class="mt-6">
          <a href="https://exam.fju.edu.tw/admission/251" target="_blank" class="inline-block px-6 py-2.5 bg-burgundy hover:bg-burgundyDark text-white font-bold rounded-lg text-sm transition">Online Registration Portal</a>
        </div>
      `,
      content_zh: `
        <h4 class="font-serif text-lg font-bold mb-2">116學年度碩士班甄試招生簡章與說明</h4>
        <p class="mb-4">輔仁大學國際經營管理碩士學位學程 (imMBA) 針對國內學生開放10月甄試招生。本班採全英語授課，具備 AACSB 國際認證與全球雙聯學位資源。</p>
        <ul class="list-disc pl-5 space-y-2 mb-4">
          <li><strong>報名時間：</strong> 2026年09月30日(三) 10:00 至 10月13日(二) 12:00 止</li>
          <li><strong>考試項目：</strong> 資料審查 (50%) + 英文口試 (50%) —— 免筆試！</li>
          <li><strong>審查資料：</strong> 書面資料審查表、身分證影本、學位證書影本、歷年成績單、自傳暨讀書計畫、推薦信乙封、英文能力證明及其他有利審查資料。</li>
        </ul>
        <div class="mt-6">
          <a href="https://exam.fju.edu.tw/admission/251" target="_blank" class="inline-block px-6 py-2.5 bg-burgundy hover:bg-burgundyDark text-white font-bold rounded-lg text-sm transition">前往輔大招生系統報名</a>
        </div>
      `
    },
    {
      id: '2905',
      top: true,
      category: 'events',
      category_en: 'Career',
      category_zh: '職涯平台',
      title_en: 'College of Management Career Platform - Job Openings & Internships',
      title_zh: '管理學院職涯平台 - 最新實習與工作職缺專區',
      date: '2026-08-30',
      image: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01779414283.jpg',
      summary_en: 'Explore international career opportunities, MNC management trainee positions, and exclusive internships for imMBA students.',
      summary_zh: '為協助學生職涯發展，學院集結跨國企業、知名外商與金融機構之實習與正職職缺，歡迎本班同學踴躍投遞。',
      content_en: '<p>The College of Management Career Center provides targeted career counseling, resume reviews, and direct interview opportunities with corporate partners.</p>',
      content_zh: '<p>輔大管理學院職涯發展中心提供一對一履歷健檢、企業說明會與專屬職缺媒合服務。</p>'
    },
    {
      id: '3402',
      top: false,
      category: 'admissions',
      category_en: 'International Admissions',
      category_zh: '外國學生招生',
      title_en: '[Considering an MBA in Taiwan?] imMBA International Student Admissions Open',
      title_zh: '【身邊有正在考慮 MBA 的國際學生嗎？】imMBA 國際學生申請專區',
      date: '2026-09-15',
      image: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01779413586.jpg',
      summary_en: 'Share the program with international peers! Applications for international degree students are now open with full English support and scholarship opportunities.',
      summary_zh: '歡迎推薦外國學生申請輔大 imMBA，全程英語授課、環境國際化，並提供豐富外國學生獎學金申請！',
      content_en: '<p>Our imMBA program welcomes international students from over 25 countries worldwide. Join a vibrant multicultural cohort in Taipei!</p>',
      content_zh: '<p>輔大 imMBA 擁有來自全球逾25國的國際學生，提供真正的多元文化融合與全球管理實務學習。</p>'
    },
    {
      id: '3396',
      top: false,
      category: 'academic',
      category_en: 'Academic',
      category_zh: '學術消息',
      title_en: '[Two Years in Master Degree] How Far Can You Go with imMBA?',
      title_zh: '【碩士兩年，可以有多大可能？】imMBA 學生學習與雙聯成就分享',
      date: '2026-09-08',
      image: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01495181047.jpg',
      summary_en: 'Discover how imMBA students obtain dual master degrees from Europe and complete global internships within 2 years.',
      summary_zh: '探索 imMBA 學生如何利用兩年修讀台灣與歐洲雙碩士學位、完成海外交換與知名企業實習。',
      content_en: '<p>Through partnerships like IQS School of Management (Spain), students earn two degrees in 2 years while broadening their international horizons.</p>',
      content_zh: '<p>透過西班牙 IQS 管理學院等雙聯夥伴學校，學生能在兩年內取得雙碩士學位並獲得跨國職涯入場券。</p>'
    },
    {
      id: '3391',
      top: false,
      category: 'academic',
      category_en: 'Faculty Insights',
      category_zh: '教授講堂',
      title_en: '[90 Seconds with the Professor] AI × Product Management Insights',
      title_zh: '【90 Seconds with the Professor｜AI × Product】AI 時代的產品管理講座',
      date: '2026-09-02',
      image: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01495164896.jpg',
      summary_en: 'Professor highlights how AI integration is reshaping global product strategies and cross-border business models.',
      summary_zh: '教授解析 AI 技術如何重塑全球商業產品策略與跨國管理思維。',
      content_en: '<p>Short video and seminar summary on how digital product development leverages generative AI tools.</p>',
      content_zh: '<p>深入淺出探討生成式 AI 在數位產品開發與國際商務數據分析之實務應用。</p>'
    },
    {
      id: '3376',
      top: false,
      category: 'international',
      category_en: 'Global Partner Spotlight',
      category_zh: '全球夥伴焦點',
      title_en: '[Partner Spotlight] IQS School of Management, Barcelona, Spain',
      title_zh: '【Partner Spotlight｜IQS School of Management】西班牙巴塞隆納雙聯名校介紹',
      date: '2026-07-29',
      image: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01495096198.JPG',
      summary_en: 'Discover our premium dual degree pathway with IQS School of Management in Barcelona.',
      summary_zh: '認識輔大 imMBA 與西班牙名校 IQS School of Management 之雙碩士學位合作計畫。',
      content_en: '<p>Students study year 1 at FJCU and year 2 in Barcelona to earn both FJCU MBA and IQS Master degrees.</p>',
      content_zh: '<p>學生第一年在輔大修課，第二年至西班牙巴塞隆納 IQS 研習，即可同時取得兩校碩士學位。</p>'
    }
  ],

  // Core Program Pillars (Simplified, elegant Top 10 B-School style)
  features: [
    {
      number: '01',
      title_en: 'AACSB AACSB International Accreditation',
      title_zh: 'AACSB 國際權威認證 (Top 5%)',
      desc_en: 'Continuous accreditation since 2005 (re-accredited in 2010, 2015, 2020 & 2025). AACSB represents the highest standard of achievement for business schools worldwide.',
      desc_zh: '輔大管理學院於 2005 年通過 AACSB 國際認證（兩岸首家），並於 2010、2015、2020 及 2025 年連續通過認證。全球僅前 5% 頂尖商學院獲此殊榮。'
    },
    {
      number: '02',
      title_en: 'Eduniversal Top 3 Business School Ranking',
      title_zh: 'Eduniversal 國際排名全台前三',
      desc_en: 'Ranked Top 3 in Taiwan and Top 20 in Far East Asia under the International Management category by Eduniversal Official Business Schools Ranking.',
      desc_zh: '榮獲 Eduniversal 國際商管學院評鑑排名：International Management 分類全台 Top 3、遠東地區 Top 20，品質極具國際公信力。'
    },
    {
      number: '03',
      title_en: 'MOE Landmark Bilingual College',
      title_zh: '100% 全英語授課與國際多元同儕',
      desc_en: 'Selected by the Ministry of Education as a Key Bilingual Cultivation College in Greater Taipei. All core & elective courses taught in English.',
      desc_zh: '獲選教育部「大專校院雙語化學習計畫」重點培育學院（大台北私立唯一），全英語授課，同儕來自全球逾25國。'
    },
    {
      number: '04',
      title_en: 'Global Catholic University Alliance Network',
      title_zh: '全球天主教與耶穌會黃金名校人脈',
      desc_en: 'Part of global networks like IFCU, ACUCA, and AJCU, granting students direct access to prestigious partner institutions across Europe, the Americas, and Asia.',
      desc_zh: '擁有獨特天主教大學聯盟（IFCU、AJCU、ACUCA等）網絡，校友與姊妹校遍布全球，提供優質的跨國職涯發展能力。'
    }
  ],

  // Admissions Info (招生資訊)
  admissions: {
    domestic: {
      tracks: [
        {
          name_en: 'Fall/Spring Recommendation Admission (甄試招生)',
          name_zh: '10月 甄試招生 (免筆試)',
          time_en: 'Registration: Sept 30 - Oct 13 | Interview: Nov | Results: Dec',
          time_zh: '網路報名：每年 09/30 - 10/13 | 口試：11月 | 放榜：12月',
          entry_en: 'Spring (Feb) or Fall (Sept) Enrollment available for early graduates.',
          entry_zh: '可選擇第2學期 (2月提早入學) 或次學年第1學期 (9月入學)。',
          criteria_en: 'Document Review (50%) + English Oral Interview (50%)',
          criteria_zh: '書面資料審查 (50%) + 英文口試 (50%)'
        },
        {
          name_en: 'Entrance Examination (碩士班一般招生)',
          name_zh: '1月 碩士一般招生 (免筆試)',
          time_en: 'Registration: Jan | Interview: March | Results: March',
          time_zh: '網路報名：每年 1月初 | 口試與放榜：3月',
          entry_en: 'Fall (Sept) Enrollment.',
          entry_zh: '次學年第1學期 (9月入學)。',
          criteria_en: 'Document Review (50%) + English Oral Interview (50%)',
          criteria_zh: '書面資料審查 (50%) + 英文口試 (50%)'
        }
      ],
      docs: [
        { name_en: 'Document Review Cover Sheet', name_zh: '書面資料審查表' },
        { name_en: 'National ID Card Copy', name_zh: '國民身分證影本' },
        { name_en: 'Bachelor Degree Diploma Copy', name_zh: '學位證書影本' },
        { name_en: 'Bachelor Transcript of Academic Records', name_zh: '學士班歷年成績單正本' },
        { name_en: 'Autobiography & Study Plan in English', name_zh: '自傳暨讀書計畫 (英文)' },
        { name_en: 'One Letter of Recommendation', name_zh: '推薦信乙封' },
        { name_en: 'English Proficiency Certificate (TOEIC / TOEFL / IELTS / GEPT)', name_zh: '英文能力證明 (TOEIC / TOEFL / IELTS 等)' },
        { name_en: 'Other Supporting Documents (Certificates, Work Experience)', name_zh: '其他有利審查資料 (證照、實習經歷等)' }
      ]
    },
    international: {
      info_en: 'International applicants from foreign countries apply through Fu Jen University International Student Application Portal. Application round runs from October to April.',
      info_zh: '外國學生（非中華民國國籍）請透過輔仁大學國際學生申請系統投遞，申請時程約為每年10月至翌年4月。',
      scholarship_en: 'Taiwan MOE Scholarships and Fu Jen Outstanding International Graduate Student Scholarships are available.',
      scholarship_zh: '提供教育部台灣獎學金、輔仁大學外國學生獎學金及 imMBA 專屬獎助學金。'
    }
  },

  // Curriculum Structure (課程資訊)
  curriculum: {
    requirements_en: 'Minimum 42 Credits required for graduation (Core Courses: 24 credits, Elective Courses: 18 credits, plus Master Thesis/Capstone Project).',
    requirements_zh: '畢業總學分數：42 學分（含必修 24 學分、選修 18 學分，及碩士論文/專題實作）。全程英語授課。',
    categories: [
      {
        name_en: 'Core Required Courses (必修課程)',
        name_zh: '核心必修課程',
        credits: '24 Credits',
        courses: [
          { code: 'MBA601', title_en: 'Organizational Behavior & Cross-Cultural Leadership', title_zh: '組織行為與跨文化領導', credits: 3 },
          { code: 'MBA602', title_en: 'Strategic Management & Global Business Policy', title_zh: '策略管理與全球企業政策', credits: 3 },
          { code: 'MBA603', title_en: 'Global Marketing Strategy', title_zh: '全球行銷策略', credits: 3 },
          { code: 'MBA604', title_en: 'Corporate Financial Management', title_zh: '企業財務管理', credits: 3 },
          { code: 'MBA605', title_en: 'Managerial Economics & Global Strategy', title_zh: '管理經濟與全球策略', credits: 3 },
          { code: 'MBA606', title_en: 'Business Research Methodology', title_zh: '商業研究方法', credits: 3 },
          { code: 'MBA607', title_en: 'Business Analytics & Data-Driven Decision Making', title_zh: '商業分析與數據決策', credits: 3 },
          { code: 'MBA608', title_en: 'Business Ethics & Corporate Sustainability (ESG)', title_zh: '企業倫理與永續發展 (ESG)', credits: 3 }
        ]
      },
      {
        name_en: 'Elective Specializations (選修領域)',
        name_zh: '選修領域課程',
        credits: '18 Credits',
        courses: [
          { code: 'MBA701', title_en: 'AI-Assisted Digital Product Development', title_zh: 'AI 輔助數位產品開發實務', credits: 3 },
          { code: 'MBA702', title_en: 'International Financial Markets & FinTech', title_zh: '國際金融市場與金融科技', credits: 3 },
          { code: 'MBA703', title_en: 'Global Supply Chain & Operations Logistics', title_zh: '全球供應鏈與營運物流', credits: 3 },
          { code: 'MBA704', title_en: 'Digital Marketing & E-Commerce Strategy', title_zh: '數位行銷與電子商務策略', credits: 3 },
          { code: 'MBA705', title_en: 'Cross-Border Entrepreneurship & Innovation', title_zh: '跨國創業與創新管理', credits: 3 }
        ]
      }
    ]
  },

  // Faculty Directory (師資介紹)
  faculty: [
    {
      name_en: 'Dr. Bruce C.H. Lee',
      name_zh: '李宗培 教授 / 學程主任',
      title_en: 'Program Director & Professor',
      title_zh: '學程主任 兼 專任教授',
      degree_en: 'Ph.D. in Management, National Taiwan University',
      degree_zh: '國立臺灣大學 管理學博士',
      expertise_en: 'Strategic Management, International Business Strategy, Cross-Border Mergers & Acquisitions',
      expertise_zh: '策略管理、國際企業策略、跨國併購與企業併購',
      email: 'chlee@mail.fju.edu.tw',
      office: 'LM Building, Room 412'
    },
    {
      name_en: 'Dr. Maria Vance',
      name_zh: '瑪麗亞 教授',
      title_en: 'Professor of International Marketing',
      title_zh: '國際行銷 專任教授',
      degree_en: 'Ph.D. in Marketing, University of California, Berkeley',
      degree_zh: '美國加州大學柏克萊分校 行銷學博士',
      expertise_en: 'Global Branding, Consumer Behavior, Digital Marketing Strategy',
      expertise_zh: '全球品牌管理、消費者行為學、數位行銷策略',
      email: 'mvance@mail.fju.edu.tw',
      office: 'LM Building, Room 415'
    },
    {
      name_en: 'Dr. Kevin Huang',
      name_zh: '黃健銘 博士 / 副教授',
      title_en: 'Associate Professor of Finance & FinTech',
      title_zh: '副教授',
      degree_en: 'Ph.D. in Finance, National Chengchi University',
      degree_zh: '國立政治大學 金融學博士',
      expertise_en: 'Corporate Finance, Financial Technology, Portfolio Investment',
      expertise_zh: '公司財務管理、金融科技 (FinTech)、投資組合管理',
      email: 'khuang@mail.fju.edu.tw',
      office: 'LM Building, Room 408'
    },
    {
      name_en: 'Dr. Sophia Lin',
      name_zh: '林雅婷 博士 / 副教授',
      title_en: 'Associate Professor of Business Analytics',
      title_zh: '副教授',
      degree_en: 'Ph.D. in Decision Sciences, Manchester Business School',
      degree_zh: '英國曼徹斯特商學院 決策科學博士',
      expertise_en: 'Business Analytics, AI Applications in Business, Supply Chain Analytics',
      expertise_zh: '商業數據分析、AI 商業應用、供應鏈大數據分析',
      email: 'slin@mail.fju.edu.tw',
      office: 'LM Building, Room 420'
    }
  ],

  // Dual Degree & Global Partners
  globalPartners: [
    {
      school_en: 'IQS School of Management (Universitat Ramon Llull)',
      school_zh: '西班牙 IQS 管理學院 (巴塞隆納)',
      country: 'Spain / 西班牙',
      type: 'Dual Master Degree (雙碩士學位)',
      image: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01495181047.jpg',
      desc_en: 'Earn an MBA from FJCU and a Master of Science in Global Entrepreneurship & Management from IQS Barcelona within 2 years.',
      desc_zh: '兩年內同時取得輔仁大學 imMBA 與西班牙巴塞隆納 IQS 管理學院理學碩士雙學位。'
    },
    {
      school_en: 'ESCP Business School',
      school_zh: '歐洲 ESCP 高等商管學院',
      country: 'France & Europe / 歐洲跨國',
      type: 'Exchange & Dual Degree Pathway',
      image: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01495164896.jpg',
      desc_en: 'World-renowned business school with campuses in Paris, Berlin, London, Madrid, and Turin.',
      desc_zh: '全球頂尖高商，於巴黎、柏林、倫敦、馬德里等多國設有校區。'
    },
    {
      school_en: 'Global Catholic University Alliance',
      school_zh: '天主教全球大學聯盟交換計畫',
      country: 'USA & Worldwide / 美國與全球',
      type: '100+ Exchange Destinations',
      image: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01779413586.jpg',
      desc_en: 'Direct exchange opportunities across North America, Europe, and Asia-Pacific partner universities.',
      desc_zh: '提供直通北美、歐洲與亞太地區名校之單學期與全學年交換學生計畫。'
    }
  ],

  // Form Downloads
  downloads: [
    {
      id: 'd1',
      title_en: '116 Academic Year Recommendation Admission Document Review Form',
      title_zh: '116學年度 甄試招生書面審查表 (.doc)',
      file: '116_imMBA_ReviewForm.doc',
      size: '145 KB'
    },
    {
      id: 'd2',
      title_en: 'Autobiography and Study Plan Template (English)',
      title_zh: '自傳暨讀書計畫標準範本 (.pdf)',
      file: 'imMBA_StudyPlan_Template.pdf',
      size: '220 KB'
    },
    {
      id: 'd3',
      title_en: 'Course Credit Exemption / Transfer Application Form',
      title_zh: '研究生課程學分抵免申請表 (.doc)',
      file: 'Credit_Exemption_Form.doc',
      size: '98 KB'
    },
    {
      id: 'd4',
      title_en: 'Master Thesis Advisory Agreement & Defense Application',
      title_zh: '指導教授同意書暨論文學位口試申請表 (.pdf)',
      file: 'Thesis_Advisory_Agreement.pdf',
      size: '310 KB'
    },
    {
      id: 'd5',
      title_en: 'imMBA Graduation Checklist & Leaving School Procedure',
      title_zh: 'imMBA 畢業與離校程序檢核表 (.pdf)',
      file: 'Graduation_Checklist_imMBA.pdf',
      size: '180 KB'
    }
  ],

  // Real Authentic FJCU Photo Gallery
  gallery: [
    {
      title_en: 'FJCU imMBA Students Collaboration & Case Discussion',
      title_zh: 'imMBA 學生個案研討與跨國專案合作',
      url: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01779414963.jpg',
      tag: 'Academic'
    },
    {
      title_en: 'International MBA Campus Seminars',
      title_zh: '國際經營管理碩士班專題研討會',
      url: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01779414610.jpg',
      tag: 'Seminar'
    },
    {
      title_en: 'Cross-Cultural Orientation & Student Gathering',
      title_zh: '跨文化國際新生始業式與交流晚會',
      url: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01779414283.jpg',
      tag: 'Orientation'
    },
    {
      title_en: 'Global Business Executive Lecture Series',
      title_zh: '全球企業高階主管名人講堂',
      url: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01779413586.jpg',
      tag: 'Executive'
    },
    {
      title_en: 'Team Building & Cross-Border Leadership Workshop',
      title_zh: '團隊建立與跨國領導力實務工作坊',
      url: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01779413559.jpg',
      tag: 'Workshop'
    },
    {
      title_en: 'Faculty & Graduate Student Research Presentation',
      title_zh: '師生國際學術論文發表研討會',
      url: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01779412948.jpg',
      tag: 'Research'
    },
    {
      title_en: 'European Dual Degree Graduation in Barcelona',
      title_zh: '西班牙巴塞隆納雙聯學位畢業典禮現場',
      url: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01495181047.jpg',
      tag: 'Dual Degree'
    },
    {
      title_en: 'FJCU Commencement & MBA Degree Ceremony',
      title_zh: '輔仁大學管理學院碩士學位頒授典禮',
      url: 'https://www.management.fju.edu.tw/upfiles/tw_/menu01495096198.JPG',
      tag: 'Graduation'
    }
  ]
};

// UI Static i18n Strings (Editorial Top 10 B-School Style)
const i18n = {
  en: {
    nav_brand: 'FU JEN imMBA',
    nav_full_title: 'International Master of Business Administration',
    nav_college: 'College of Management',
    nav_about: 'About',
    nav_news: 'News & Insights',
    nav_admissions: 'Admissions',
    nav_curriculum: 'Academics',
    nav_faculty: 'Faculty',
    nav_global: 'Dual Degree',
    nav_downloads: 'Downloads',
    nav_contact: 'Contact',
    btn_apply: 'Apply to imMBA',
    btn_search: 'Search',
    btn_read_more: 'Read More',
    btn_download: 'Download Document',
    hero_badge: 'AACSB ACCREDITED | EDUNIVERSAL TOP 3 IN TAIWAN',
    hero_title: 'Educating Leaders Who Shape the Future of Global Business',
    hero_subtitle: 'Fu Jen Catholic University imMBA — A 100% All-English Taught Master Program with Dual Master Degrees in Europe & International Diversity.',
    hero_cta_admission: 'Admissions Information',
    hero_cta_brochure: 'Download Prospectus',
    sec_news_title: 'News & Program Insights',
    sec_news_subtitle: 'Explore the latest announcements, faculty research, and global partner spotlights.',
    sec_about_title: 'The imMBA Advantage',
    sec_about_subtitle: 'AACSB accreditation, Ministry of Education bilingual landmark college, and global mobility.',
    sec_admissions_title: 'Admissions & Selection',
    sec_admissions_subtitle: 'Dual application pathways for domestic and international candidates.',
    sec_curriculum_title: 'Academic Excellence',
    sec_curriculum_subtitle: 'A rigorous 42-credit master curriculum designed for global management leaders.',
    sec_faculty_title: 'Distinguished Faculty',
    sec_faculty_subtitle: 'Learn from world-educated professors with deep research and consulting expertise.',
    sec_global_title: 'Global Dual Degree Pathways',
    sec_global_subtitle: 'Earn dual master degrees with IQS Barcelona and exchange at 100+ partner universities.',
    sec_downloads_title: 'Download Center',
    sec_downloads_subtitle: 'Access application review forms, study plan templates, and graduation checklists.',
    sec_contact_title: 'Contact Admissions Office',
    sec_contact_subtitle: 'Visit our campus at LM Building or reach out to our office.',
    contact_address: 'No. 510, Zhongzheng Rd., Xinzhuang Dist., New Taipei City 242062, Taiwan (R.O.C.)',
    contact_office: 'Room 412, LM Building, College of Management',
    contact_phone: '+886-2-2905-2960 / 2905-3985',
    contact_email: 'immba@mail.fju.edu.tw',
    form_name: 'Full Name',
    form_email: 'Email Address',
    form_subject: 'Subject',
    form_message: 'Message',
    form_submit: 'Submit Inquiry',
    footer_copyright: 'Copyright © 2026 College of Management, Fu Jen Catholic University. All Rights Reserved.'
  },
  zh: {
    nav_brand: '輔大 imMBA',
    nav_full_title: '輔仁大學國際經營管理碩士學位學程',
    nav_college: '輔仁大學管理學院',
    nav_about: '關於學程',
    nav_news: '最新消息',
    nav_admissions: '招生專區',
    nav_curriculum: '課程架構',
    nav_faculty: '師資陣容',
    nav_global: '跨國雙碩士',
    nav_downloads: '表格下載',
    nav_contact: '聯絡我們',
    btn_apply: '立即報名',
    btn_search: '搜尋',
    btn_read_more: '閱讀全文',
    btn_download: '下載檔案',
    hero_badge: 'AACSB 國際認證 | EDUNIVERSAL 全台 TOP 3',
    hero_title: '培育引領全球商業未來的國際管理領袖',
    hero_subtitle: '輔仁大學國際經營管理碩士班 (imMBA) — 100% 全英語授課、歐洲名校雙碩士學位與跨國多元文化學習環境。',
    hero_cta_admission: '查看招生簡章',
    hero_cta_brochure: '下載招生說明',
    sec_news_title: '最新消息與觀點',
    sec_news_subtitle: '即時掌握最新招生時程、學術講座與全球雙聯 partner 動向。',
    sec_about_title: '輔大 imMBA 卓越優勢',
    sec_about_subtitle: '全球 Top 5% AACSB 權威認證、教育部大專雙語重點培育學院與國際移動力。',
    sec_admissions_title: '招生與選拔',
    sec_admissions_subtitle: '針對國內甄試/碩士班及外國學生提供完整入學管道與獎學金。',
    sec_curriculum_title: '嚴謹學術課程',
    sec_curriculum_subtitle: '42 學分全英語碩士課程，涵蓋跨國策略、數據分析與永續經營。',
    sec_faculty_title: '國際頂尖師資',
    sec_faculty_subtitle: '匯聚全球名校博士與具豐富產業顧問經驗之教授群。',
    sec_global_title: '跨國雙碩士與海外交換',
    sec_global_subtitle: '前往西班牙巴塞隆納 IQS 管理學院取得雙碩士，或至全球 100+ 姊妹校交換。',
    sec_downloads_title: '文件與表單下載專區',
    sec_downloads_subtitle: '提供審查表單、自傳讀書計畫範例、抵免申請與畢業檢核表下載。',
    sec_contact_title: '聯絡學程辦公室',
    sec_contact_subtitle: '歡迎親臨輔大管理學院 LM 大樓，或透過以下表單與我們聯繫。',
    contact_address: '242062 新北市新莊區中正路510號 輔仁大學管理學院',
    contact_office: '管理學院 LM大樓 412室 (imMBA 學程辦公室)',
    contact_phone: '(02) 2905-2960 / (02) 2905-3985',
    contact_email: 'immba@mail.fju.edu.tw',
    form_name: '您的姓名',
    form_email: '電子郵件',
    form_subject: '詢問主題',
    form_message: '諮詢內容',
    form_submit: '送出詢問',
    footer_copyright: 'Copyright © 2026 輔仁大學管理學院 國際經營管理碩士班. 版權所有.'
  }
};
