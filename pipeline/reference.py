"""Reference data: skill taxonomy, NCO-2015 occupation groups, ITI trades, PLFS code lists.

Everything the NLP and supply models need to talk the same language lives here.
Edit this file (not the models) to add skills or aliases.
"""

CLUSTERS = {
    "SW": "Software & Cloud",
    "DA": "Data & AI",
    "CY": "Cybersecurity & Networking",
    "EL": "Electronics & Semiconductors",
    "GE": "Green Energy & EV",
    "MF": "Manufacturing & Automation",
    "CO": "Construction & Building Trades",
    "HC": "Healthcare",
    "LR": "Logistics & Retail",
    "BF": "BFSI & Accounting",
    "SM": "Sales, Marketing & Service",
    "AG": "Agriculture & Food Processing",
    "HT": "Hospitality & Tourism",
    "TX": "Textiles & Apparel",
    "CS": "Core & Soft Skills",
}

# NCO-2015 sub-major groups (2-digit). NCO-2015 follows the ISCO-08 structure.
NCO_GROUPS = {
    "11": "Chief executives, senior officials & legislators",
    "12": "Administrative & commercial managers",
    "13": "Production & specialised services managers",
    "14": "Hospitality, retail & other services managers",
    "21": "Science & engineering professionals",
    "22": "Health professionals",
    "23": "Teaching professionals",
    "24": "Business & administration professionals",
    "25": "ICT professionals",
    "26": "Legal, social & cultural professionals",
    "31": "Science & engineering associate professionals",
    "32": "Health associate professionals",
    "33": "Business & administration associate professionals",
    "34": "Legal, social & cultural associate professionals",
    "35": "ICT technicians",
    "41": "General & keyboard clerks",
    "42": "Customer services clerks",
    "43": "Numerical & material recording clerks",
    "44": "Other clerical support workers",
    "51": "Personal service workers",
    "52": "Sales workers",
    "53": "Personal care workers",
    "54": "Protective services workers",
    "61": "Market-oriented skilled agricultural workers",
    "62": "Skilled forestry, fishery & hunting workers",
    "63": "Subsistence farmers & fishers",
    "71": "Building & related trades workers",
    "72": "Metal, machinery & related trades workers",
    "73": "Handicraft & printing workers",
    "74": "Electrical & electronic trades workers",
    "75": "Food processing, woodworking & garment trades",
    "81": "Stationary plant & machine operators",
    "82": "Assemblers",
    "83": "Drivers & mobile plant operators",
    "91": "Cleaners & helpers",
    "92": "Agricultural, forestry & fishery labourers",
    "93": "Labourers in mining, construction, manufacturing & transport",
    "94": "Food preparation assistants",
    "95": "Street & related sales and service workers",
    "96": "Refuse workers & other elementary workers",
}

# (name, cluster, alias regex, prior NCO groups, training route, weeks, cost INR per trainee, trend tag)
# trend tag: "emerging" | "growing" | "stable" | "declining"  (used only by the synthetic generator)
_S = [
    # ---------------- Software & Cloud
    ("Python", "SW", r"python", "25,21", "Online: NPTEL Programming in Python / PMKVY IT-ITeS", 8, 6000, "growing"),
    ("Java", "SW", r"java(?!\s*script)", "25", "Online: NPTEL Programming in Java", 10, 7000, "stable"),
    ("JavaScript", "SW", r"javascript|ecmascript", "25", "Online: SWAYAM Web Development", 8, 6000, "stable"),
    ("TypeScript", "SW", r"typescript", "25", "Online: Web development track", 4, 4000, "growing"),
    ("React", "SW", r"react(?:\.?js)?(?!\s+(?:to|quickly|promptly))|react native", "25", "Bootcamp: Front-end development", 8, 15000, "growing"),
    ("Node.js", "SW", r"node\.?js|nodejs|express\.?js", "25", "Bootcamp: Back-end development", 8, 15000, "growing"),
    ("SQL", "SW", r"sql|mysql|postgresql|postgres|pl/sql|t-sql|oracle database", "25,24,35", "Online: NPTEL Database Systems", 6, 5000, "stable"),
    ("AWS", "SW", r"aws|amazon web services", "25,35", "Certification: AWS Cloud Practitioner", 6, 12000, "growing"),
    ("Microsoft Azure", "SW", r"azure", "25,35", "Certification: Azure Fundamentals", 6, 12000, "growing"),
    ("Google Cloud", "SW", r"gcp|google cloud", "25", "Certification: Google Cloud Digital Leader", 6, 12000, "growing"),
    ("Docker", "SW", r"docker|containeri[sz]ation", "25", "Online: DevOps track", 4, 6000, "growing"),
    ("Kubernetes", "SW", r"kubernetes|k8s", "25", "Certification: CKA", 6, 15000, "growing"),
    ("DevOps & CI/CD", "SW", r"devops|ci/cd|jenkins|github actions|continuous integration", "25,35", "Online: DevOps track", 8, 10000, "growing"),
    ("Microservices", "SW", r"micro-?services?", "25", "Bootcamp: Back-end development", 6, 10000, "stable"),
    ("Spring Boot", "SW", r"spring ?boot", "25", "Bootcamp: Java back-end", 6, 10000, "stable"),
    (".NET / C#", "SW", r"\.net\b|c#|asp\.net", "25", "Online: .NET developer track", 8, 8000, "stable"),
    ("Git", "SW", r"git|github|gitlab|bitbucket", "25", "Online: version control basics", 1, 1000, "stable"),
    ("REST APIs", "SW", r"rest ?apis?|restful", "25", "Bootcamp: Back-end development", 3, 4000, "stable"),
    ("Mobile App Development", "SW", r"android|kotlin|flutter|ios development|swift ui|swiftui", "25", "Bootcamp: Mobile apps", 10, 15000, "stable"),
    ("Software Testing", "SW", r"selenium|manual testing|automation testing|test cases|software testing|qa automation", "25,35", "PMKVY: Software Tester (IT-ITeS)", 8, 8000, "stable"),
    ("Linux", "SW", r"linux|unix|shell scripting|bash scripting", "25,35", "Online: Linux administration", 4, 4000, "stable"),
    # ---------------- Data & AI
    ("Machine Learning", "DA", r"machine learning|ml models?", "25,21", "Online: NPTEL Introduction to Machine Learning", 12, 8000, "growing"),
    ("Deep Learning", "DA", r"deep learning|neural networks?", "25,21", "Online: NPTEL Deep Learning", 12, 8000, "growing"),
    ("Generative AI", "DA", r"generative ai|gen ?ai|llms?|large language models?|prompt engineering|retrieval[- ]augmented|\brag\b pipelines?", "25,21", "Online: IndiaAI / Generative AI courses", 6, 6000, "emerging"),
    ("NLP", "DA", r"nlp|natural language processing|text analytics", "25,21", "Online: NPTEL NLP", 8, 6000, "growing"),
    ("Computer Vision", "DA", r"computer vision|opencv|image processing|object detection", "25,21", "Online: NPTEL Computer Vision", 8, 6000, "growing"),
    ("Data Analysis", "DA", r"data analysis|data analytics|data analyst|exploratory analysis", "24,25,33", "PMKVY: Junior Data Associate", 8, 6000, "growing"),
    ("Power BI", "DA", r"power ?bi", "24,25,33", "Certification: Power BI Data Analyst", 4, 5000, "growing"),
    ("Tableau", "DA", r"tableau", "24,25", "Certification: Tableau Specialist", 4, 5000, "stable"),
    ("Advanced Excel", "DA", r"advanced excel|ms excel|excel|vlookup|pivot tables?", "24,33,41,43", "Short course: Advanced Excel", 3, 2500, "stable"),
    ("Statistics", "DA", r"statistics|statistical|hypothesis testing|regression analysis", "21,24,25", "Online: NPTEL Statistics", 8, 4000, "stable"),
    ("Big Data / Spark", "DA", r"spark|pyspark|hadoop|big data|databricks", "25", "Online: Big data engineering", 8, 10000, "growing"),
    ("Data Engineering", "DA", r"etl|data pipelines?|data engineering|airflow|data warehous\w*|snowflake", "25", "Bootcamp: Data engineering", 10, 15000, "growing"),
    ("TensorFlow / PyTorch", "DA", r"tensorflow|pytorch|keras", "25,21", "Online: Deep learning frameworks", 6, 6000, "growing"),
    ("MLOps", "DA", r"mlops|model deployment|model monitoring", "25", "Bootcamp: MLOps", 6, 12000, "emerging"),
    # ---------------- Cybersecurity & Networking
    ("Cybersecurity", "CY", r"cyber ?security|information security|infosec", "25,35", "Certification: CompTIA Security+ / NIELIT", 10, 15000, "growing"),
    ("Network Administration", "CY", r"network administration|networking|ccna|tcp/ip|routing and switching|lan/wan|firewalls?", "25,35", "Certification: CCNA", 10, 15000, "stable"),
    ("SOC & SIEM", "CY", r"\bsoc\b|siem|splunk|security operations", "25,35", "Certification: SOC Analyst", 8, 15000, "growing"),
    ("Ethical Hacking", "CY", r"ethical hacking|penetration testing|vapt|ceh", "25", "Certification: CEH", 10, 25000, "growing"),
    ("Cloud Security", "CY", r"cloud security|iam policies|zero trust", "25", "Certification: CCSK", 6, 20000, "emerging"),
    ("Hardware & Network Support", "CY", r"hardware and networking|desktop support|it support|hardware troubleshooting|system administrator", "35,74", "ITI: Computer Hardware & Network Maintenance", 24, 12000, "stable"),
    # ---------------- Electronics & Semiconductors
    ("Embedded Systems", "EL", r"embedded systems?|embedded c|microcontrollers?|arm cortex|firmware", "21,31,25", "Online: NPTEL Embedded Systems", 12, 10000, "growing"),
    ("VLSI Design", "EL", r"vlsi|asic|rtl design|verilog|vhdl|physical design", "21", "Programme: Chips to Startup (C2S) / VLSI course", 16, 40000, "emerging"),
    ("PCB Design", "EL", r"pcb design|pcb layout|altium|orcad", "21,31", "Short course: PCB design", 6, 8000, "growing"),
    ("Electronics Assembly & Repair", "EL", r"\bsmt\b|soldering|electronics assembly|mobile repair|electronic repair", "74,82", "ESSCI: Assembly Operator / Field Technician", 12, 9000, "growing"),
    ("IoT", "EL", r"\biot\b|internet of things|smart sensors?", "21,25,74", "ITI: IoT Technician (Smart City)", 24, 12000, "growing"),
    ("Semiconductor Fab & OSAT", "EL", r"semiconductor|wafer|cleanroom|clean room|osat|wire bonding", "31,81,82", "Programme: Semiconductor technician (ISM)", 16, 30000, "emerging"),
    # ---------------- Green Energy & EV
    ("Solar PV Installation", "GE", r"solar pv|solar panel installation|solar installation|rooftop solar|solar technician|suryamitra", "74,31,71", "NSQF: Solar PV Installer (Suryamitra) / ITI Solar Technician", 12, 12000, "emerging"),
    ("Solar Plant O&M", "GE", r"solar plant o&m|solar o&m|o&m of solar|solar operations and maintenance", "74,31", "NSQF: Solar PV O&M Technician", 8, 10000, "emerging"),
    ("EV Battery & Powertrain", "GE", r"ev battery|battery management system|\bbms\b|electric vehicles?|ev powertrain|ev technician|ev maintenance|battery pack", "72,74,31", "ITI: Mechanic Electric Vehicle", 24, 15000, "emerging"),
    ("Wind Turbine Maintenance", "GE", r"wind turbines?|wind farm", "74,31", "NSQF: Wind Turbine Technician", 12, 15000, "growing"),
    ("Energy Audit & Efficiency", "GE", r"energy audit|energy efficiency|energy management", "21,31", "Certification: BEE Energy Auditor", 8, 15000, "growing"),
    ("Green Hydrogen", "GE", r"green hydrogen|electroly[sz]er", "21,31", "Programme: Green hydrogen technician", 12, 25000, "emerging"),
    # ---------------- Manufacturing & Automation
    ("CNC Operation", "MF", r"\bcnc\b|\bvmc\b|cnc programming|cnc operator", "72,81", "ITI: Machinist / CNC Operator (NSQF)", 24, 14000, "growing"),
    ("Welding", "MF", r"welding|welder|\btig\b|\bmig\b|arc welding", "72", "ITI: Welder", 52, 12000, "stable"),
    ("Fitting & Machining", "MF", r"\bfitter\b|fitting|machining|lathe|turner", "72", "ITI: Fitter / Turner", 52, 12000, "stable"),
    ("CAD Design (AutoCAD/SolidWorks)", "MF", r"autocad|solidworks|catia|\bcad\b|creo", "21,31", "ITI: Draughtsman (Mech/Civil)", 24, 10000, "stable"),
    ("PLC & Industrial Automation", "MF", r"\bplc\b|scada|industrial automation|\bhmi\b|instrumentation", "31,74", "ITI: Instrument Mechanic / NSQF Automation Technician", 24, 15000, "growing"),
    ("Quality Control", "MF", r"quality control|\bqc\b|quality inspection|quality assurance|iso 9001", "31,75,81", "NSQF: Quality Inspector", 8, 7000, "stable"),
    ("Lean & Six Sigma", "MF", r"lean manufacturing|six sigma|kaizen|\b5s\b", "13,31", "Certification: Lean Six Sigma Green Belt", 4, 8000, "stable"),
    ("Industrial Maintenance", "MF", r"preventive maintenance|breakdown maintenance|maintenance technician|plant maintenance", "72,74", "ITI: Maintenance Mechanic", 24, 10000, "stable"),
    ("Robotics", "MF", r"robotics|robotic|cobots?", "21,31", "Short course: Industrial robotics", 12, 20000, "emerging"),
    ("Production Planning", "MF", r"production planning|\bppc\b|\bmrp\b|shop floor", "13,31,43", "Short course: Production planning", 6, 6000, "stable"),
    ("Automobile Servicing", "MF", r"automobile|automotive service|motor mechanic|two-wheeler mechanic|vehicle servicing", "72", "ITI: Mechanic Motor Vehicle", 52, 12000, "stable"),
    # ---------------- Construction & Building Trades
    ("Electrician (Wiring)", "CO", r"electrician|electrical wiring|house wiring|wireman", "74", "ITI: Electrician", 52, 12000, "growing"),
    ("Plumbing", "CO", r"plumbing|plumber", "71", "ITI: Plumber", 24, 9000, "stable"),
    ("Masonry", "CO", r"\bmasons?\b|masonry|bricklaying", "71", "ITI: Mason (Building Constructor)", 24, 8000, "stable"),
    ("Carpentry", "CO", r"carpentry|carpenter", "71,75", "ITI: Carpenter", 24, 8000, "stable"),
    ("HVAC & Refrigeration", "CO", r"hvac|refrigeration|ac technician|air conditioning", "71,74", "ITI: Refrigeration & Air Conditioning Technician", 52, 12000, "growing"),
    ("Site Supervision", "CO", r"site supervisor|site supervision|site engineer", "31,13", "NSQF: Construction Site Supervisor", 12, 9000, "stable"),
    ("Surveying", "CO", r"surveying|surveyor|total station", "31", "ITI: Surveyor", 52, 10000, "stable"),
    ("BIM", "CO", r"\bbim\b|revit|building information modell?ing", "21,31", "Short course: BIM / Revit", 8, 12000, "emerging"),
    ("Bar Bending & Shuttering", "CO", r"bar bending|shuttering|scaffolding|formwork", "71,93", "NSQF: Bar Bender & Steel Fixer", 8, 6000, "stable"),
    # ---------------- Healthcare
    ("Nursing", "HC", r"nursing|staff nurse|\bgnm\b|b\.?sc nursing|\banm\b", "22,32", "Diploma: GNM / B.Sc Nursing", 104, 120000, "growing"),
    ("Patient Care (GDA)", "HC", r"patient care|general duty assistant|\bgda\b|ward assistant", "53,32", "NSQF: General Duty Assistant", 12, 8000, "growing"),
    ("Phlebotomy", "HC", r"phlebotom\w+|blood collection|sample collection", "32", "NSQF: Phlebotomy Technician", 12, 8000, "growing"),
    ("Medical Lab Technology", "HC", r"medical laborator\w+|lab technician|\bdmlt\b|\bmlt\b|pathology lab", "32", "Diploma: DMLT", 52, 40000, "growing"),
    ("Pharmacy", "HC", r"pharmacist|pharmacy|dispensing", "22,32", "Diploma: D.Pharm", 104, 80000, "stable"),
    ("Radiology Technology", "HC", r"radiology|x-ray technician|ct scan|mri technician|radiographer", "32", "Diploma: Radiology technician", 52, 50000, "growing"),
    ("Medical Coding", "HC", r"medical coding|icd-?10|cpt coding", "33,32", "Certification: CPC medical coder", 12, 20000, "growing"),
    ("Home Health & Elderly Care", "HC", r"home health aide|elderly care|geriatric care|caregiver", "53", "NSQF: Home Health Aide", 12, 8000, "emerging"),
    ("Emergency Medical Tech", "HC", r"emergency medical technician|\bemt\b|paramedic", "32", "NSQF: Emergency Medical Technician", 24, 15000, "growing"),
    # ---------------- Logistics & Retail
    ("Warehouse Management", "LR", r"warehouse|\bwms\b|warehousing", "43,13,93", "NSQF: Warehouse Associate (LSC)", 6, 6000, "growing"),
    ("Inventory Management", "LR", r"inventory management|inventory control|stock management|stock audit", "43,33", "NSQF: Inventory Clerk", 4, 5000, "stable"),
    ("Supply Chain Management", "LR", r"supply chain|\bscm\b|procurement|logistics management|vendor management", "24,33,13", "Certification: Supply chain management", 10, 15000, "growing"),
    ("Forklift Operation", "LR", r"forklift|reach truck|material handling equipment", "83", "NSQF: Forklift Operator", 4, 6000, "growing"),
    ("Last-mile Delivery", "LR", r"delivery executive|last[- ]mile|delivery partner|delivery boy|courier", "83,96", "NSQF: Delivery Associate", 2, 3000, "growing"),
    ("Retail Sales", "LR", r"retail sales|store operations|visual merchandising|merchandising|store executive", "52,14", "NSQF: Retail Sales Associate (RASCI)", 6, 5000, "stable"),
    ("E-commerce Operations", "LR", r"e-?commerce|marketplace operations|catalog management", "33,43", "NSQF: E-commerce Executive", 6, 6000, "growing"),
    ("Commercial Driving", "LR", r"(?:truck|commercial|heavy vehicle|delivery|cab|bus) drivers?|driving licen[cs]e|\bhmv\b|\blmv\b", "83", "NSQF: Commercial Vehicle Driver (IDTR)", 8, 10000, "stable"),
    ("EXIM Documentation", "LR", r"export import|\bexim\b|customs clearance|freight forwarding", "33", "Short course: EXIM documentation", 6, 8000, "stable"),
    # ---------------- BFSI & Accounting
    ("Accounting", "BF", r"accounting|bookkeeping|accounts payable|accounts receivable|general ledger", "24,33,43", "Short course: Accounts Executive (BFSI SSC)", 12, 8000, "stable"),
    ("Tally", "BF", r"tally", "33,43", "Certification: Tally Prime", 6, 5000, "stable"),
    ("GST & Taxation", "BF", r"\bgst\b|taxation|\btds\b|income tax", "24,33", "Certification: GST practitioner", 8, 6000, "stable"),
    ("Financial Analysis", "BF", r"financial analysis|financial model?l?ing|valuation|fp&a", "24", "Certification: Financial modelling", 8, 15000, "stable"),
    ("Banking Operations", "BF", r"banking operations|\bkyc\b|loan processing|credit appraisal|branch banking", "33,42", "NSQF: Business Correspondent / Banking ops", 8, 8000, "stable"),
    ("Insurance Sales", "BF", r"insurance sales|insurance advisor|insurance agent|policy sales", "33,52", "IRDAI agent certification", 4, 3000, "stable"),
    ("Auditing", "BF", r"auditing|internal audit|statutory audit|audit", "24", "Short course: Internal audit", 8, 10000, "stable"),
    ("Microfinance & Collections", "BF", r"microfinance|collections|loan recovery|debt recovery", "33,52", "NSQF: Microfinance Executive", 4, 4000, "stable"),
    # ---------------- Sales, Marketing & Service
    ("Digital Marketing", "SM", r"digital marketing|\bseo\b|\bsem\b|google ads|social media marketing|performance marketing", "24,33", "Online: Google Digital Garage / PMKVY", 8, 6000, "growing"),
    ("Customer Service", "SM", r"customer service|customer support|customer care|client servicing", "42,52", "NSQF: Customer Care Executive", 6, 5000, "stable"),
    ("Telecalling / Voice Process", "SM", r"telecall\w+|voice process|\bbpo\b|inbound calls?|outbound calls?", "42", "NSQF: CRM Domestic Voice", 6, 5000, "declining"),
    ("CRM Tools", "SM", r"\bcrm\b|salesforce|zoho|hubspot", "24,33,42", "Certification: Salesforce Admin", 6, 10000, "growing"),
    ("Field Sales & B2B", "SM", r"field sales|b2b sales|business development|channel sales|sales targets?", "52,33,24", "NSQF: Sales Associate", 4, 4000, "stable"),
    ("Content Writing", "SM", r"content writ\w+|copywrit\w+|content creation", "26", "Online: Content writing", 6, 4000, "stable"),
    ("Graphic Design", "SM", r"graphic design|photoshop|illustrator|coreldraw|canva", "21,34", "Short course: Graphic design", 12, 10000, "stable"),
    ("UI/UX Design", "SM", r"ui/ux|ux design|ui design|figma|user research|wireframing", "21,25", "Bootcamp: UI/UX", 12, 20000, "growing"),
    # ---------------- Agriculture & Food Processing
    ("Precision Farming & Agri-Drones", "AG", r"precision agriculture|precision farming|agri[- ]?drones?|drone pilot|drone operations", "61,31", "Programme: Drone Pilot (DGCA RPTO) / ITI Drone Technician", 8, 35000, "emerging"),
    ("Drip & Micro Irrigation", "AG", r"drip irrigation|micro[- ]irrigation|sprinkler", "61,92", "NSQF: Micro Irrigation Technician (ASCI)", 6, 6000, "growing"),
    ("Food Processing", "AG", r"food processing|food production line|food technolog\w+|processing plant", "75,81", "NSQF: Food Processing (FICSI)", 12, 9000, "growing"),
    ("Food Safety (FSSAI/HACCP)", "AG", r"haccp|fssai|food safety", "31,75", "Certification: FoSTaC food safety supervisor", 2, 3000, "growing"),
    ("Dairy Technology", "AG", r"dairy|milk processing|milk collection", "75,61", "NSQF: Dairy Processing Technician", 12, 8000, "stable"),
    ("Organic Farming", "AG", r"organic farming|organic cultivation|natural farming", "61", "NSQF: Organic Grower (ASCI)", 8, 5000, "growing"),
    ("Farm Machinery Operation", "AG", r"tractor|farm machinery|harvester|agricultural machinery", "83,72", "NSQF: Tractor Operator", 6, 6000, "stable"),
    ("Agri Advisory & Sales", "AG", r"agri sales|agronomist|agronomy|crop advisory|agri input", "21,52,31", "Diploma: Agri-input dealer (DAESI)", 48, 20000, "stable"),
    # ---------------- Hospitality & Tourism
    ("Food Production (Cook/Chef)", "HT", r"\bchef\b|commis|\bcooks?\b|culinary|kitchen operations", "51,94", "ITI: Food Production (General)", 52, 12000, "growing"),
    ("F&B Service", "HT", r"f&b service|food and beverage service|steward|waiter", "51", "NSQF: F&B Service Steward", 8, 6000, "stable"),
    ("Housekeeping", "HT", r"housekeeping|room attendant", "51,91", "NSQF: Room Attendant", 6, 5000, "stable"),
    ("Front Office", "HT", r"front office|front desk|guest relations|receptionist", "42", "NSQF: Front Office Associate", 6, 5000, "stable"),
    ("Travel & Tour Operations", "HT", r"tour operations|travel consultant|ticketing|tour guide", "42,51", "NSQF: Travel Consultant", 8, 6000, "growing"),
    # ---------------- Textiles & Apparel
    ("Sewing Machine Operation", "TX", r"sewing machine|stitching|tailor\w*|sewing operator", "75,81", "ITI: Sewing Technology / NSQF Sewing Machine Operator", 12, 7000, "stable"),
    ("Pattern Making & Cutting", "TX", r"pattern mak\w+|pattern master|garment cutting|fabric cutting", "75", "NSQF: Pattern Maker", 12, 9000, "stable"),
    ("Textile Quality Inspection", "TX", r"fabric inspection|textile testing|garment quality|quality checker", "75,31", "NSQF: Quality Checker (AMHSSC)", 6, 6000, "stable"),
    ("Fashion Design", "TX", r"fashion design|apparel design", "21,34", "ITI: Fashion Design & Technology", 52, 15000, "stable"),
    ("Handloom & Weaving", "TX", r"weaving|handloom|loom operator|power ?loom", "73,81", "NSQF: Weaver (Handloom/Powerloom)", 12, 6000, "declining"),
    # ---------------- Core & Soft Skills
    ("Communication (English)", "CS", r"communication skills|english communication|spoken english|verbal and written communication|written communication|communication", "", "Short course: Spoken English / Employability skills", 4, 3000, "stable"),
    ("Teamwork", "CS", r"teamwork|team player|collaboration|collaborative", "", "Employability skills module", 1, 500, "stable"),
    ("Problem Solving", "CS", r"problem[- ]solving|analytical thinking|critical thinking", "", "Employability skills module", 1, 500, "stable"),
    ("Leadership & People Management", "CS", r"leadership|team handling|people management|stakeholder management", "", "Short course: Supervisory skills", 4, 6000, "stable"),
    ("Project Management", "CS", r"project management|\bpmp\b|agile|scrum|\bjira\b", "", "Certification: PMP / CAPM / Agile", 6, 15000, "stable"),
    ("Computer Literacy (MS Office)", "CS", r"ms office|computer knowledge|basic computer|ms word|data entry", "", "ITI: COPA / NIELIT CCC", 12, 3000, "declining"),
    ("Regional Language", "CS", r"hindi|regional language|local language|marathi|tamil|telugu|kannada|bengali|punjabi|gujarati|malayalam|odia", "", "-", 0, 0, "stable"),
]

SKILLS = [
    {
        "id": i,
        "name": n,
        "cluster": c,
        "pattern": p,
        "nco_prior": [x for x in nco.split(",") if x],
        "training_route": r,
        "training_weeks": w,
        "cost_inr": cost,
        "trend": t,
    }
    for i, (n, c, p, nco, r, w, cost, t) in enumerate(_S)
]
SKILL_BY_NAME = {s["name"]: s for s in SKILLS}

# Tools/sub-skills that are taught inside broader programmes; kept in gap analysis, excluded from
# training-priority ranking and budget allocation (nobody runs a "Git programme").
MICRO_SKILLS = {"Git", "REST APIs", "Microservices", "Spring Boot", "TypeScript", "Statistics", "TensorFlow / PyTorch",
                "Linux", "Regional Language"}

# Real ITI trade names (DGT/NCVT) -> skills they produce
ITI_TRADES = {
    "Electrician": ["Electrician (Wiring)", "Industrial Maintenance"],
    "Fitter": ["Fitting & Machining"],
    "Welder": ["Welding"],
    "Turner": ["Fitting & Machining"],
    "Machinist": ["CNC Operation", "Fitting & Machining"],
    "Mechanic Motor Vehicle": ["Automobile Servicing"],
    "Mechanic Electric Vehicle": ["EV Battery & Powertrain"],
    "Electronics Mechanic": ["Electronics Assembly & Repair"],
    "Computer Operator & Programming Assistant (COPA)": ["Computer Literacy (MS Office)", "Advanced Excel"],
    "Plumber": ["Plumbing"],
    "Carpenter": ["Carpentry"],
    "Refrigeration & Air Conditioner Technician": ["HVAC & Refrigeration"],
    "Draughtsman (Civil)": ["CAD Design (AutoCAD/SolidWorks)", "Surveying"],
    "Draughtsman (Mechanical)": ["CAD Design (AutoCAD/SolidWorks)"],
    "Sewing Technology": ["Sewing Machine Operation"],
    "Food Production (General)": ["Food Production (Cook/Chef)"],
    "Solar Technician (Electrical)": ["Solar PV Installation", "Solar Plant O&M"],
    "Instrument Mechanic": ["PLC & Industrial Automation"],
    "Mason (Building Constructor)": ["Masonry"],
    "Surveyor": ["Surveying"],
    "Fashion Design & Technology": ["Fashion Design", "Pattern Making & Cutting"],
    "Drone Technician": ["Precision Farming & Agri-Drones"],
    "IoT Technician (Smart City)": ["IoT"],
    "Computer Hardware & Network Maintenance": ["Hardware & Network Support"],
}
# rough national mix of trades across ITIs (Electrician and Fitter dominate in reality)
ITI_TRADE_WEIGHTS = {
    "Electrician": 30, "Fitter": 22, "Welder": 10, "Turner": 5, "Machinist": 5,
    "Mechanic Motor Vehicle": 9, "Mechanic Electric Vehicle": 2, "Electronics Mechanic": 7,
    "Computer Operator & Programming Assistant (COPA)": 18, "Plumber": 4, "Carpenter": 2,
    "Refrigeration & Air Conditioner Technician": 4, "Draughtsman (Civil)": 4,
    "Draughtsman (Mechanical)": 3, "Sewing Technology": 6, "Food Production (General)": 2,
    "Solar Technician (Electrical)": 1.5, "Instrument Mechanic": 2, "Mason (Building Constructor)": 1.5,
    "Surveyor": 2, "Fashion Design & Technology": 3, "Drone Technician": 0.6,
    "IoT Technician (Smart City)": 0.6, "Computer Hardware & Network Maintenance": 2,
}

# PLFS code lists (from the PLFS instruction manual; check against the layout of the year you load)
PLFS_GEN_EDU = {
    1: "Not literate", 2: "Literate without formal schooling (EGS/NFEC/AEC)", 3: "Literate: TLC",
    4: "Literate: others", 5: "Below primary", 6: "Primary", 7: "Middle", 8: "Secondary",
    10: "Higher secondary", 11: "Diploma/certificate course", 12: "Graduate", 13: "Postgraduate & above",
}
PLFS_TECH_EDU = {
    1: "No technical education", 2: "Technical degree: agriculture", 3: "Technical degree: engineering/technology",
    4: "Technical degree: medicine", 5: "Technical degree: crafts", 6: "Technical degree: other subjects",
    7: "Diploma below graduate: agriculture", 8: "Diploma below graduate: engineering/technology",
    9: "Diploma below graduate: medicine", 10: "Diploma below graduate: crafts", 11: "Diploma below graduate: other",
    12: "Diploma graduate+: agriculture", 13: "Diploma graduate+: engineering/technology",
    14: "Diploma graduate+: medicine", 15: "Diploma graduate+: crafts", 16: "Diploma graduate+: other",
}
PLFS_VOC_FIELD = {
    1: "Aerospace & aviation", 2: "Agriculture: non-crop based", 3: "Agriculture: crop based",
    4: "Allied manufacturing: gems & jewellery", 5: "Allied manufacturing: leather",
    6: "Allied manufacturing: textile & handloom", 7: "Artisan/craftsman/handicraft", 8: "Automotive",
    9: "Beauty & wellness", 10: "Chemical engineering/hydrocarbons", 11: "Civil engineering: construction, plumbing",
    12: "Electrical, power & electronics", 13: "Healthcare & life sciences", 14: "Hospitality & tourism",
    15: "Iron & steel, mining", 16: "IT-ITeS", 17: "Logistics", 18: "Mechanical engineering & capital goods",
    19: "Media & entertainment", 20: "Office & business related work", 21: "Security", 22: "Telecom",
    23: "Textile & apparel", 24: "Childcare, nutrition & pre-school", 25: "Others",
}
# Which skill clusters a jobseeker's training/education points to (used to infer jobseeker skills)
VOC_FIELD_TO_CLUSTER = {
    1: {"MF": 0.6, "EL": 0.4}, 2: {"AG": 1.0}, 3: {"AG": 1.0}, 4: {"TX": 1.0}, 5: {"TX": 1.0},
    6: {"TX": 1.0}, 7: {"TX": 0.6, "CO": 0.4}, 8: {"MF": 0.8, "GE": 0.2}, 9: {"HT": 0.5, "SM": 0.5},
    10: {"MF": 1.0}, 11: {"CO": 1.0}, 12: {"CO": 0.45, "EL": 0.35, "GE": 0.2}, 13: {"HC": 1.0},
    14: {"HT": 1.0}, 15: {"MF": 1.0}, 16: {"SW": 0.45, "DA": 0.3, "CY": 0.25}, 17: {"LR": 1.0},
    18: {"MF": 1.0}, 19: {"SM": 1.0}, 20: {"BF": 0.5, "SM": 0.3, "LR": 0.2}, 21: {"LR": 1.0},
    22: {"CY": 0.6, "EL": 0.4}, 23: {"TX": 1.0}, 24: {"HC": 1.0}, 25: {"SM": 0.5, "LR": 0.5},
}
TECH_EDU_TO_CLUSTER = {
    2: {"AG": 1.0}, 3: {"SW": 0.35, "DA": 0.15, "EL": 0.15, "MF": 0.2, "CO": 0.1, "CY": 0.05},
    4: {"HC": 1.0}, 5: {"TX": 0.5, "CO": 0.5}, 6: {"BF": 0.5, "SM": 0.5}, 7: {"AG": 1.0},
    8: {"MF": 0.35, "CO": 0.25, "EL": 0.2, "SW": 0.1, "GE": 0.1}, 9: {"HC": 1.0}, 10: {"TX": 0.5, "CO": 0.5},
    11: {"BF": 0.4, "SM": 0.4, "LR": 0.2}, 12: {"AG": 1.0}, 13: {"SW": 0.4, "DA": 0.2, "EL": 0.15, "MF": 0.15, "CY": 0.1},
    14: {"HC": 1.0}, 15: {"TX": 0.5, "CO": 0.5}, 16: {"BF": 0.5, "SM": 0.3, "DA": 0.2},
}
GEN_EDU_TO_CLUSTER = {  # fallback when no technical education / training
    "low": {"LR": 0.35, "CO": 0.25, "AG": 0.2, "TX": 0.1, "HT": 0.1},
    "secondary": {"LR": 0.3, "SM": 0.25, "CO": 0.15, "MF": 0.15, "HT": 0.1, "BF": 0.05},
    "graduate": {"BF": 0.25, "SM": 0.25, "DA": 0.15, "SW": 0.15, "LR": 0.1, "HC": 0.05, "CY": 0.05},
}
