/**
 * Job board taxonomy — source types for discovery and apply targeting.
 * `status`: live = automated fetcher | manual = user/extension queue | planned = roadmap
 * `ingestType`: ats | api | rss | xml | scraper | partner | manual | extension
 */

const LIVE_FETCHER_KEYS = new Set([
  'remoteok',
  'remotive',
  'jobicy',
  'himalayas',
  'weworkremotely',
  'greenhouse',
  'lever',
  'ashby',
  'jungle',
  'roberthalf',
  'arbeitnow',
  'workingnomads',
  'jobspresso',
  'fourdayweek',
  'landingjobs',
  'wellfound',
  'dice',
  'indeed',
  'adzuna',
  'devitjobs',
  'aijobs',
  'ycombinator',
  'workatastartup',
  'usajobs',
  'ziprecruiter',
  'monster',
  'careerbuilder',
  'glassdoor',
  'remote_co',
]);

const BOARD_OVERRIDES = {
  linkedin: { status: 'manual', ingestType: 'manual', fetcherKey: 'linkedin', url: 'https://www.linkedin.com/jobs' },
  remote_ok: { status: 'live', ingestType: 'api', fetcherKey: 'remoteok', url: 'https://remoteok.com' },
  remotive: { status: 'live', ingestType: 'api', fetcherKey: 'remotive', url: 'https://remotive.com' },
  we_work_remotely: { status: 'live', ingestType: 'rss', fetcherKey: 'weworkremotely', url: 'https://weworkremotely.com' },
  remote_co: { status: 'live', ingestType: 'rss', fetcherKey: 'remote_co', url: 'https://remote.co' },
  jobspresso: { status: 'live', ingestType: 'rss', fetcherKey: 'jobspresso', url: 'https://jobspresso.co' },
  working_nomads: { status: 'live', ingestType: 'api', fetcherKey: 'workingnomads', url: 'https://workingnomads.com' },
  jobicy: { status: 'live', ingestType: 'api', fetcherKey: 'jobicy', url: 'https://jobicy.com' },
  himalayas: { status: 'live', ingestType: 'api', fetcherKey: 'himalayas', url: 'https://himalayas.app' },
  '4dayweek_io': { status: 'live', ingestType: 'api', fetcherKey: 'fourdayweek', url: 'https://4dayweek.io' },
  landing_jobs: { status: 'live', ingestType: 'api', fetcherKey: 'landingjobs', url: 'https://landing.jobs' },
  welcome_to_the_jungle: { status: 'live', ingestType: 'api', fetcherKey: 'jungle', url: 'https://welcometothejungle.com' },
  wellfound: { status: 'live', ingestType: 'extension', fetcherKey: 'wellfound', url: 'https://wellfound.com' },
  y_combinator_jobs: { status: 'live', ingestType: 'api', fetcherKey: 'ycombinator', url: 'https://www.ycombinator.com/jobs' },
  work_at_a_startup: { status: 'live', ingestType: 'api', fetcherKey: 'workatastartup', url: 'https://www.workatastartup.com' },
  dice: { status: 'live', ingestType: 'api', fetcherKey: 'dice', url: 'https://www.dice.com' },
  devitjobs: { status: 'live', ingestType: 'api', fetcherKey: 'devitjobs', url: 'https://devitjobs.com' },
  aijobs_net: { status: 'live', ingestType: 'api', fetcherKey: 'aijobs', url: 'https://aijobs.net' },
  greenhouse: { status: 'live', ingestType: 'ats', fetcherKey: 'greenhouse', url: 'https://boards.greenhouse.io' },
  lever: { status: 'live', ingestType: 'ats', fetcherKey: 'lever', url: 'https://jobs.lever.co' },
  ashby: { status: 'live', ingestType: 'ats', fetcherKey: 'ashby', url: 'https://jobs.ashbyhq.com' },
  robert_half: { status: 'live', ingestType: 'partner', fetcherKey: 'roberthalf', url: 'https://www.roberthalf.com' },
  arbeitnow: { status: 'live', ingestType: 'api', fetcherKey: 'arbeitnow', url: 'https://arbeitnow.com' },
  indeed: { status: 'live', ingestType: 'rss', fetcherKey: 'indeed', url: 'https://www.indeed.com' },
  adzuna: { status: 'live', ingestType: 'api', fetcherKey: 'adzuna', url: 'https://www.adzuna.com' },
  usajobs: { status: 'live', ingestType: 'api', fetcherKey: 'usajobs', url: 'https://www.usajobs.gov' },
  ziprecruiter: { status: 'live', ingestType: 'rss', fetcherKey: 'ziprecruiter', url: 'https://www.ziprecruiter.com' },
  monster: { status: 'live', ingestType: 'rss', fetcherKey: 'monster', url: 'https://www.monster.com' },
  careerbuilder: { status: 'live', ingestType: 'rss', fetcherKey: 'careerbuilder', url: 'https://www.careerbuilder.com' },
  glassdoor: { status: 'live', ingestType: 'rss', fetcherKey: 'glassdoor', url: 'https://www.glassdoor.com' },
  simplyhired: { status: 'planned', ingestType: 'scraper' },
  jooble: { status: 'planned', ingestType: 'partner' },
  jobrapido: { status: 'planned', ingestType: 'partner' },
  flexjobs: { status: 'planned', ingestType: 'scraper' },
  nodesk: { status: 'planned', ingestType: 'scraper' },
  remotehub: { status: 'planned', ingestType: 'scraper' },
  otta: { status: 'planned', ingestType: 'api' },
  built_in: { status: 'planned', ingestType: 'api' },
  stack_overflow_jobs: { status: 'manual', ingestType: 'manual', notes: 'Archive — use company ATS or LinkedIn' },
  workday_careers: { status: 'planned', ingestType: 'ats' },
  oracle_recruiting: { status: 'planned', ingestType: 'ats' },
  sap_successfactors: { status: 'planned', ingestType: 'ats' },
  smartrecruiters: { status: 'planned', ingestType: 'ats' },
  icims: { status: 'planned', ingestType: 'ats' },
  bamboohr: { status: 'planned', ingestType: 'ats' },
  jazzhr: { status: 'planned', ingestType: 'ats' },
  jobvite: { status: 'planned', ingestType: 'ats' },
  taleo: { status: 'planned', ingestType: 'ats' },
  workable: { status: 'planned', ingestType: 'ats' },
  recruitee: { status: 'planned', ingestType: 'ats' },
  teamtailor: { status: 'planned', ingestType: 'ats' },
  personio: { status: 'planned', ingestType: 'ats' },
  breezy_hr: { status: 'planned', ingestType: 'ats' },
  comeet: { status: 'planned', ingestType: 'ats' },
  rippling: { status: 'planned', ingestType: 'ats' },
  pinpoint: { status: 'planned', ingestType: 'ats' },
  careerjet: { status: 'planned', ingestType: 'partner' },
  jora: { status: 'planned', ingestType: 'partner' },
  state_government_portals: { status: 'planned', ingestType: 'api', notes: 'Per-state open data feeds' },
  county_jobs: { status: 'planned', ingestType: 'api' },
  city_jobs: { status: 'planned', ingestType: 'api' },
  university_career_portals: { status: 'planned', ingestType: 'api' },
  caci_careers: { status: 'planned', ingestType: 'scraper' },
  booz_allen_careers: { status: 'planned', ingestType: 'scraper' },
  leidos_careers: { status: 'planned', ingestType: 'scraper' },
  general_dynamics_careers: { status: 'planned', ingestType: 'scraper' },
  uber: { status: 'manual', ingestType: 'manual' },
  lyft: { status: 'manual', ingestType: 'manual' },
  doordash: { status: 'manual', ingestType: 'manual' },
  instacart: { status: 'manual', ingestType: 'manual' },
  shipt: { status: 'manual', ingestType: 'manual' },
  amazon_flex: { status: 'manual', ingestType: 'manual' },
  spark_driver: { status: 'manual', ingestType: 'manual' },
};

const TAXONOMY = [
  { id: 'general', label: 'General', boards: ['LinkedIn', 'Indeed', 'Glassdoor', 'ZipRecruiter', 'Monster', 'CareerBuilder', 'SimplyHired', 'Jooble', 'Jobrapido', 'Adzuna'] },
  { id: 'remote', label: 'Remote', boards: ['Remote OK', 'Remotive', 'We Work Remotely', 'FlexJobs', 'Remote.co', 'Jobspresso', 'NoDesk', 'Working Nomads', 'RemoteHub', 'Jobicy', 'Himalayas', '4dayweek.io', 'Landing Jobs'] },
  { id: 'startup', label: 'Startup', boards: ['Wellfound', 'Y Combinator Jobs', 'Work at a Startup', 'Otta', 'Built In', 'Welcome to the Jungle'] },
  { id: 'technology', label: 'Technology', boards: ['Dice', 'Hired', 'Stack Overflow Jobs', 'DevITJobs', 'JSRemotely', 'Golang Jobs', 'Python.org Jobs'] },
  { id: 'ai-ml', label: 'AI & Machine Learning', boards: ['AIJobs.net', 'Hugging Face Jobs', 'MachineLearningJobs.com'] },
  { id: 'data-science', label: 'Data Science', boards: ['DataJobs', 'Data Elixir Jobs', 'KDnuggets Jobs'] },
  { id: 'devops-cloud', label: 'DevOps & Cloud', boards: ['DevOpsJobs', 'Cloud Native Jobs', 'CNCF Jobs', 'Linux Foundation Jobs'] },
  { id: 'cybersecurity', label: 'Cybersecurity', boards: ['CyberSecJobs', 'Infosec Jobs', 'ClearanceJobs'] },
  { id: 'government', label: 'Government', boards: ['USAJobs', 'State government portals', 'County jobs', 'City jobs'] },
  { id: 'education', label: 'Education', boards: ['HigherEdJobs', 'SchoolSpring', 'EDJOIN'] },
  { id: 'healthcare', label: 'Healthcare', boards: ['Health eCareers', 'PracticeLink', 'PracticeMatch', 'HospitalCareers', 'Nurse.com Jobs'] },
  { id: 'nursing', label: 'Nursing', boards: ['Vivian Health', 'Incredible Health', 'NurseFly', 'TravelNursing.com'] },
  { id: 'physicians', label: 'Physicians', boards: ['DocCafe', 'NEJM CareerCenter'] },
  { id: 'pharmacy', label: 'Pharmacy', boards: ['PharmacyWeek Jobs', 'RxCareerCenter'] },
  { id: 'finance', label: 'Finance', boards: ['eFinancialCareers', 'FinancialJobBank'] },
  { id: 'accounting', label: 'Accounting', boards: ['AccountingJobsToday', 'AICPA Career Center'] },
  { id: 'banking', label: 'Banking', boards: ['BankJobs', 'American Bankers Association Jobs'] },
  { id: 'sales', label: 'Sales', boards: ['Rainmakers', 'SalesJobs'] },
  { id: 'marketing', label: 'Marketing', boards: ['MarketingHire', 'AMA Career Center'] },
  { id: 'design', label: 'Design', boards: ['Dribbble Jobs', 'Behance Jobs', 'Working Not Working'] },
  { id: 'creative', label: 'Creative', boards: ['Mandy', 'ProductionHUB', 'Staff Me Up'] },
  { id: 'writing', label: 'Writing', boards: ['ProBlogger Jobs', 'FreelanceWritingGigs'] },
  { id: 'legal', label: 'Legal', boards: ['LawJobs', 'BCG Attorney Search', 'LawCrossing'] },
  { id: 'human-resources', label: 'Human Resources', boards: ['SHRM Job Board', 'HRJobs'] },
  { id: 'manufacturing', label: 'Manufacturing', boards: ['ManufacturingJobs', 'iHireManufacturing'] },
  { id: 'engineering', label: 'Engineering', boards: ['Engineering.com Jobs', 'ASME Career Center', 'IEEE Job Site'] },
  { id: 'construction', label: 'Construction', boards: ['ConstructionJobs', 'iHireConstruction'] },
  { id: 'skilled-trades', label: 'Skilled Trades', boards: ['Tradesmen Jobs', 'SkilledTradesOntario Jobs'] },
  { id: 'oil-gas', label: 'Oil & Gas', boards: ['Rigzone'] },
  { id: 'energy', label: 'Energy', boards: ['Energy Jobline'] },
  { id: 'aviation', label: 'Aviation', boards: ['Avjobs', 'JSfirm'] },
  { id: 'aerospace', label: 'Aerospace', boards: ['SpaceCrew', 'Space Talent'] },
  { id: 'maritime', label: 'Maritime', boards: ['Maritime Jobs'] },
  { id: 'transportation', label: 'Transportation', boards: ['TruckingJobs', 'CDLjobs'] },
  { id: 'logistics', label: 'Logistics', boards: ['SupplyChainCareers'] },
  { id: 'warehouse', label: 'Warehouse', boards: ['WarehouseGig'] },
  { id: 'hospitality', label: 'Hospitality', boards: ['HCareers', 'CatererGlobal'] },
  { id: 'restaurants', label: 'Restaurants', boards: ['Poached Jobs', 'Culinary Agents'] },
  { id: 'retail', label: 'Retail', boards: ['NRF Job Board', 'RetailChoice'] },
  { id: 'real-estate', label: 'Real Estate', boards: ['SelectLeaders'] },
  { id: 'agriculture', label: 'Agriculture', boards: ['AgCareers'] },
  { id: 'science', label: 'Science', boards: ['Science Careers', 'Nature Careers'] },
  { id: 'biotechnology', label: 'Biotechnology', boards: ['BioSpace Jobs'] },
  { id: 'pharmaceutical', label: 'Pharmaceutical', boards: ['BioPharmaGuy Jobs'] },
  { id: 'nonprofit', label: 'Nonprofit', boards: ['Idealist'] },
  { id: 'social-impact', label: 'Social Impact', boards: ['Escape the City'] },
  { id: 'media', label: 'Media', boards: ['JournalismJobs'] },
  { id: 'broadcasting', label: 'Broadcasting', boards: ['TVJobs'] },
  { id: 'music', label: 'Music', boards: ['Entertainment Careers'] },
  { id: 'gaming', label: 'Gaming', boards: ['Hitmarker'] },
  { id: 'esports', label: 'Esports', boards: ['Hitmarker Esports'] },
  { id: 'film', label: 'Film', boards: ['Mandy', 'ProductionHUB'] },
  { id: 'events', label: 'Events', boards: ['EventCareers'] },
  { id: 'sports', label: 'Sports', boards: ['TeamWork Online'] },
  { id: 'fitness', label: 'Fitness', boards: ['FitnessJobs'] },
  { id: 'childcare', label: 'Childcare', boards: ['Care.com'] },
  { id: 'elder-care', label: 'Elder Care', boards: ['Care.com'] },
  { id: 'domestic-services', label: 'Domestic Services', boards: ['Care.com', 'Housekeeper.com'] },
  { id: 'gig-work', label: 'Gig Work', boards: ['TaskRabbit', 'Wonolo', 'Instawork', 'GigSmart'] },
  { id: 'freelance', label: 'Freelance', boards: ['Upwork', 'Fiverr', 'Contra', 'Toptal', 'Guru', 'PeoplePerHour'] },
  { id: 'internships', label: 'Internships', boards: ['Handshake', 'Internships.com', 'WayUp'] },
  { id: 'students', label: 'Students', boards: ['RippleMatch', 'Handshake'] },
  { id: 'executive', label: 'Executive', boards: ['BlueSteps', 'ExecuNet'] },
  { id: 'diversity', label: 'Diversity', boards: ['PowerToFly', 'Inclusively', 'Jopwell', 'Black Career Network', 'AbilityJobs'] },
  { id: 'veterans', label: 'Veterans', boards: ['RecruitMilitary', 'Hire Heroes USA'] },
  { id: 'disabled-professionals', label: 'Disabled Professionals', boards: ['AbilityJobs'] },
  { id: 'second-chance', label: 'Second Chance', boards: ['Honest Jobs'] },
  { id: 'international', label: 'International', boards: ['Reed (UK)', 'Seek (Australia)', 'JobStreet (Asia)', 'Naukri (India)', 'JobsDB', 'StepStone (Europe)', 'TotalJobs', 'CV-Library', 'Xing Jobs'] },
  { id: 'company-ats', label: 'Company career networks (ATS)', boards: ['Greenhouse', 'Lever', 'Ashby', 'Workday Careers', 'Oracle Recruiting', 'SAP SuccessFactors', 'SmartRecruiters', 'iCIMS', 'BambooHR', 'JazzHR', 'Jobvite', 'Taleo', 'Workable', 'Recruitee', 'Teamtailor', 'Personio', 'Breezy HR', 'Comeet', 'Rippling', 'Pinpoint'] },
  { id: 'staffing', label: 'Staffing & recruiting firms', boards: ['Robert Half', 'Randstad', 'Adecco', 'Manpower', 'Kelly', 'Kforce', 'Insight Global', 'TEKsystems', 'Apex Systems', 'Motion Recruitment', 'Experis', 'Dice Talent Solutions', 'Arbeitnow'] },
  { id: 'university', label: 'University job boards', boards: ['Handshake', 'College Recruiter', 'Symplicity', 'University career portals'] },
  { id: 'military-contractors', label: 'Military & government contractors', boards: ['ClearanceJobs', 'CACI Careers', 'Booz Allen Careers', 'Leidos Careers', 'General Dynamics Careers'] },
  { id: 'international-aggregators', label: 'International aggregators', boards: ['Jooble', 'Adzuna', 'Jobrapido', 'CareerJet', 'Jora'] },
  { id: 'gig-economy', label: 'Gig economy platforms', boards: ['Uber', 'Lyft', 'DoorDash', 'Instacart', 'Shipt', 'Amazon Flex', 'Spark Driver'] },
];

const INGEST_GUIDANCE = [
  'Direct ATS integrations (Greenhouse, Lever, Workday, Ashby, etc.)',
  'XML job feeds',
  'JSON job APIs',
  'RSS feeds',
  'Company career pages',
  'Government open data',
  'Staffing agency feeds',
  'University career portals',
  'Public job APIs',
  'Structured web scraping where permitted by site terms and applicable law',
];

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function buildBoard(name, categoryId) {
  const id = slugify(name);
  const override = BOARD_OVERRIDES[id] || {};
  const fetcherKey = override.fetcherKey || null;
  let status = override.status;
  if (!status) {
    if (fetcherKey && LIVE_FETCHER_KEYS.has(fetcherKey)) status = 'live';
    else status = 'planned';
  }
  return {
    id,
    name,
    category: categoryId,
    ingestType: override.ingestType || (status === 'live' ? 'api' : 'scraper'),
    status,
    fetcherKey,
    url: override.url || null,
    notes: override.notes || null,
  };
}

let _flat = null;
let _byId = null;

function buildIndexes() {
  if (_flat) return;
  const seen = new Set();
  _flat = [];
  _byId = new Map();
  for (const cat of TAXONOMY) {
    for (const name of cat.boards) {
      const board = buildBoard(name, cat.id);
      if (seen.has(board.id)) continue;
      seen.add(board.id);
      _flat.push(board);
      _byId.set(board.id, board);
    }
  }
}

function getCategories() {
  buildIndexes();
  return TAXONOMY.map((cat) => ({
    id: cat.id,
    label: cat.label,
    boards: cat.boards.map((name) => _byId.get(slugify(name))).filter(Boolean),
  }));
}

function getAllBoards() {
  buildIndexes();
  return _flat.slice();
}

function getBoardById(id) {
  buildIndexes();
  return _byId.get(id) || null;
}

function defaultSelections() {
  const out = {};
  for (const board of getAllBoards()) {
    out[board.id] = board.status === 'live';
  }
  out.linkedin = true;
  return out;
}

function resolveSelections(selections = {}) {
  const defaults = defaultSelections();
  const merged = { ...defaults, ...(selections || {}) };
  const enabledIds = Object.entries(merged)
    .filter(([, on]) => on)
    .map(([id]) => id);
  const boards = enabledIds.map((id) => getBoardById(id)).filter(Boolean);
  const fetcherKeys = new Set(
    boards.map((b) => b.fetcherKey).filter((k) => k && LIVE_FETCHER_KEYS.has(k))
  );
  const sourceLabels = new Set(boards.map((b) => b.name));
  return { merged, enabledIds, boards, fetcherKeys, sourceLabels };
}

function jobMatchesSelections(job, selections) {
  const { merged, fetcherKeys } = resolveSelections(selections);
  const enabled = Object.entries(merged).filter(([, on]) => on).map(([id]) => id);
  if (!enabled.length) return true;
  const src = String(job?.source || '').toLowerCase();
  if (!src) return false;
  for (const id of enabled) {
    const board = getBoardById(id);
    if (!board) continue;
    if (board.fetcherKey && fetcherKeys.has(board.fetcherKey)) {
      const key = board.fetcherKey.replace(/_/g, '');
      if (src.includes(key) || src.includes(board.name.toLowerCase())) return true;
    }
    if (src.includes(board.name.toLowerCase())) return true;
  }
  if (src.includes('chrome-extension') && merged.linkedin) return true;
  return false;
}

function getCatalogPayload() {
  const boards = getAllBoards();
  return {
    categories: getCategories(),
    boards,
    ingestGuidance: INGEST_GUIDANCE,
    stats: {
      total: boards.length,
      live: boards.filter((b) => b.status === 'live').length,
      planned: boards.filter((b) => b.status === 'planned').length,
      manual: boards.filter((b) => b.status === 'manual').length,
    },
    defaultSelections: defaultSelections(),
  };
}

module.exports = {
  TAXONOMY,
  INGEST_GUIDANCE,
  LIVE_FETCHER_KEYS,
  getCategories,
  getAllBoards,
  getBoardById,
  defaultSelections,
  resolveSelections,
  jobMatchesSelections,
  getCatalogPayload,
};
