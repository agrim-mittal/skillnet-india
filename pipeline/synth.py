"""Synthetic data, generated to the same structure as the real sources.

Used only where the real files can't be fetched here (PLFS microdata, a multi-sector job feed with
history, ITI/polytechnic lists). Every row carries source='synthetic'. Drop real files in data/raw/
and the loaders in ingest.py take over.

The generator is deliberately structural, not random noise: roles have skill bundles, salary bands
and state affinities; skills have trends (emerging/declining); months have hiring seasonality.
"""
import re

import numpy as np
import pandas as pd

from . import geo
from .config import HISTORY_END, HISTORY_START, SEED
from .reference import ITI_TRADE_WEIGHTS, ITI_TRADES, SKILL_BY_NAME, SKILLS

S = SKILL_BY_NAME

# --------------------------------------------------------------------------- state affinity profiles
_P = {
    "tech": {"Karnataka": 24, "Maharashtra": 19, "Telangana": 14, "Tamil Nadu": 12, "Haryana": 8, "Delhi": 6,
             "Uttar Pradesh": 6, "West Bengal": 3, "Gujarat": 3, "Kerala": 2.5, "Rajasthan": 1, "Punjab": 1,
             "Madhya Pradesh": 1, "Odisha": 1, "Andhra Pradesh": 1.5, "Chandigarh": 0.8},
    "electronics": {"Tamil Nadu": 18, "Karnataka": 14, "Uttar Pradesh": 16, "Telangana": 7, "Gujarat": 8,
                    "Maharashtra": 9, "Haryana": 7, "Andhra Pradesh": 8, "Uttarakhand": 3, "Himachal Pradesh": 2},
    "semicon": {"Gujarat": 30, "Assam": 14, "Karnataka": 16, "Tamil Nadu": 10, "Telangana": 8, "Uttar Pradesh": 8,
                "Maharashtra": 6, "Odisha": 4, "Punjab": 3},
    "mfg": {"Maharashtra": 16, "Gujarat": 15, "Tamil Nadu": 14, "Karnataka": 7, "Haryana": 7, "Uttar Pradesh": 8,
            "Punjab": 5, "Rajasthan": 4, "West Bengal": 4, "Andhra Pradesh": 4, "Telangana": 3, "Madhya Pradesh": 3,
            "Uttarakhand": 2.5, "Himachal Pradesh": 2, "Jharkhand": 2, "Odisha": 2.5, "Chhattisgarh": 2},
    "auto": {"Tamil Nadu": 18, "Maharashtra": 18, "Haryana": 14, "Karnataka": 10, "Gujarat": 9, "Uttar Pradesh": 7,
             "Telangana": 4, "Uttarakhand": 3, "Rajasthan": 3, "Punjab": 3, "Madhya Pradesh": 3},
    "green": {"Rajasthan": 18, "Gujarat": 17, "Tamil Nadu": 11, "Karnataka": 10, "Maharashtra": 9, "Andhra Pradesh": 7,
              "Telangana": 5, "Madhya Pradesh": 5, "Punjab": 5, "Uttar Pradesh": 5, "Haryana": 3, "Odisha": 2},
    "wind": {"Tamil Nadu": 28, "Gujarat": 26, "Karnataka": 14, "Maharashtra": 11, "Rajasthan": 9, "Andhra Pradesh": 8,
             "Madhya Pradesh": 4},
    "agri": {"Uttar Pradesh": 14, "Punjab": 11, "Haryana": 8, "Madhya Pradesh": 10, "Maharashtra": 9, "Rajasthan": 7,
             "Andhra Pradesh": 6, "Gujarat": 6, "Bihar": 6, "West Bengal": 5, "Karnataka": 5, "Telangana": 4, "Odisha": 3},
    "food": {"Punjab": 11, "Maharashtra": 12, "Uttar Pradesh": 11, "Gujarat": 9, "Haryana": 7, "Tamil Nadu": 7,
             "Andhra Pradesh": 6, "Madhya Pradesh": 6, "Karnataka": 6, "West Bengal": 5, "Telangana": 4, "Kerala": 3},
    "dairy": {"Gujarat": 16, "Uttar Pradesh": 14, "Punjab": 10, "Rajasthan": 10, "Maharashtra": 9, "Haryana": 7,
              "Madhya Pradesh": 7, "Karnataka": 7, "Andhra Pradesh": 5, "Tamil Nadu": 5},
    "textile": {"Tamil Nadu": 22, "Gujarat": 16, "Maharashtra": 10, "Punjab": 8, "Uttar Pradesh": 8, "Karnataka": 7,
                "Haryana": 6, "West Bengal": 6, "Rajasthan": 5, "Telangana": 3, "Andhra Pradesh": 3},
    "hospitality": {"Maharashtra": 12, "Goa": 9, "Rajasthan": 9, "Kerala": 8, "Delhi": 9, "Karnataka": 8,
                    "Tamil Nadu": 7, "Himachal Pradesh": 5, "Uttarakhand": 5, "Uttar Pradesh": 6, "West Bengal": 4,
                    "Jammu and Kashmir": 3, "Telangana": 4, "Gujarat": 4},
    "logistics": {"Maharashtra": 16, "Haryana": 10, "Delhi": 8, "Karnataka": 10, "Tamil Nadu": 10, "Uttar Pradesh": 10,
                  "Gujarat": 9, "Telangana": 7, "West Bengal": 6, "Punjab": 3, "Rajasthan": 3, "Madhya Pradesh": 3},
    "ports": {"Maharashtra": 22, "Gujarat": 24, "Tamil Nadu": 16, "Andhra Pradesh": 9, "West Bengal": 8, "Kerala": 7,
              "Karnataka": 5, "Odisha": 5, "Delhi": 4},
}


def _profile_weights():
    st = geo.states().set_index("state")
    pop = st["pop2011"].astype(float)
    urb = st["city_pop"].astype(float) + 0.03 * pop
    out = {
        "pop": pop ** 0.95,
        "urban": urb,
        "pop_urban": np.sqrt(pop * urb),
    }
    base = pop / pop.sum()
    for k, d in _P.items():
        w = pd.Series({s: 0.15 * 100 * base[s] for s in pop.index})   # small floor everywhere
        for s, v in d.items():
            w[s] = w[s] + v
        out[k] = w
    return {k: (v / v.sum()) for k, v in out.items()}


# --------------------------------------------------------------------------- roles
# key: (titles, nco2, cluster, {skill: p}, (salary LPA lo, hi), (exp lo, hi), profile, base_weight)
CC, TW, PS, LD, PM, CL, RL = ("Communication (English)", "Teamwork", "Problem Solving", "Leadership & People Management",
                              "Project Management", "Computer Literacy (MS Office)", "Regional Language")
ROLES = {
    "software_dev": (["Software Engineer", "Software Developer", "Java Developer", "Backend Developer", "SDE II"], "25", "SW",
                     {"Java": .6, "Python": .35, "SQL": .6, "Spring Boot": .35, "Microservices": .4, "REST APIs": .5, "Git": .6, "AWS": .3, "Docker": .25, PS: .4, TW: .3}, (4, 18), (0, 8), "tech", 9),
    "frontend_dev": (["Frontend Developer", "React Developer", "UI Developer"], "25", "SW",
                     {"JavaScript": .9, "React": .85, "TypeScript": .5, "Git": .5, "REST APIs": .4, "UI/UX Design": .2}, (4, 16), (0, 6), "tech", 5),
    "fullstack_dev": (["Full Stack Developer", "MERN Stack Developer"], "25", "SW",
                      {"JavaScript": .9, "React": .7, "Node.js": .7, "SQL": .5, "Git": .5, "AWS": .3, "Docker": .2, "TypeScript": .3}, (5, 20), (1, 7), "tech", 5),
    "cloud_devops": (["DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer"], "25", "SW",
                     {"AWS": .7, "Microsoft Azure": .4, "Google Cloud": .2, "Docker": .8, "Kubernetes": .7, "DevOps & CI/CD": .9, "Linux": .7, "Python": .4, "Git": .6}, (6, 25), (2, 8), "tech", 4),
    "mobile_dev": (["Android Developer", "Flutter Developer", "Mobile App Developer"], "25", "SW",
                   {"Mobile App Development": .95, "Java": .3, "REST APIs": .5, "Git": .5}, (4, 15), (1, 6), "tech", 2),
    "qa_tester": (["QA Engineer", "Software Tester", "Automation Test Engineer"], "25", "SW",
                  {"Software Testing": .95, "Java": .3, "Python": .2, "SQL": .4, PM: .3}, (3, 12), (0, 6), "tech", 3),
    "dotnet_dev": ([".NET Developer", "Dotnet Developer"], "25", "SW",
                   {".NET / C#": .95, "SQL": .7, "Microsoft Azure": .3, "REST APIs": .4}, (4, 16), (1, 7), "tech", 2),
    "data_analyst": (["Data Analyst", "Business Analyst", "MIS Analyst"], "24", "DA",
                     {"SQL": .7, "Advanced Excel": .7, "Power BI": .5, "Tableau": .25, "Python": .4, "Data Analysis": .9, "Statistics": .3, CC: .4}, (3, 12), (0, 5), "tech", 5),
    "data_scientist": (["Data Scientist", "Machine Learning Engineer", "AI Engineer"], "25", "DA",
                       {"Python": .95, "Machine Learning": .9, "Deep Learning": .5, "Statistics": .5, "SQL": .5, "TensorFlow / PyTorch": .5, "NLP": .3, "Computer Vision": .2, "Generative AI": .35, "MLOps": .2, "AWS": .2}, (8, 30), (1, 8), "tech", 4),
    "genai_engineer": (["Generative AI Engineer", "LLM Engineer", "AI Application Developer"], "25", "DA",
                       {"Generative AI": .95, "Python": .95, "NLP": .5, "Deep Learning": .4, "MLOps": .3, "AWS": .3, "Microsoft Azure": .3, "Docker": .3, "REST APIs": .3}, (12, 40), (1, 8), "tech", 2),
    "data_engineer": (["Data Engineer", "Big Data Engineer", "ETL Developer"], "25", "DA",
                      {"Data Engineering": .9, "Big Data / Spark": .7, "SQL": .9, "Python": .8, "AWS": .4, "Microsoft Azure": .3, "Google Cloud": .2}, (6, 25), (2, 8), "tech", 3),
    "cyber_analyst": (["Cyber Security Analyst", "SOC Analyst", "Information Security Engineer"], "25", "CY",
                      {"Cybersecurity": .9, "SOC & SIEM": .6, "Network Administration": .5, "Ethical Hacking": .3, "Cloud Security": .25, "Linux": .4}, (5, 20), (1, 7), "tech", 2.5),
    "network_admin": (["Network Engineer", "Network Administrator"], "35", "CY",
                      {"Network Administration": .95, "Linux": .4, "Hardware & Network Support": .4, "Cybersecurity": .3}, (3, 10), (1, 6), "urban", 2),
    "it_support": (["IT Support Engineer", "Desktop Support Engineer", "System Administrator"], "35", "CY",
                   {"Hardware & Network Support": .9, "Network Administration": .5, "Customer Service": .3, "Linux": .3}, (2.2, 6), (0, 4), "urban", 3),
    "embedded_eng": (["Embedded Software Engineer", "Firmware Engineer"], "21", "EL",
                     {"Embedded Systems": .95, "IoT": .4, "PCB Design": .2, "Python": .2, "Linux": .3}, (5, 18), (1, 7), "electronics", 2),
    "vlsi_eng": (["VLSI Design Engineer", "RTL Design Engineer", "Physical Design Engineer"], "21", "EL",
                 {"VLSI Design": .95, "Python": .2, "Linux": .3, "Semiconductor Fab & OSAT": .1}, (8, 30), (1, 8), "semicon", 1.5),
    "electronics_tech": (["Electronics Technician", "SMT Operator", "Mobile Repair Technician", "Assembly Operator (Electronics)"], "74", "EL",
                         {"Electronics Assembly & Repair": .95, "Quality Control": .3, "Lean & Six Sigma": .1}, (1.6, 3.5), (0, 3), "electronics", 5),
    "semicon_tech": (["Semiconductor Process Technician", "OSAT Technician", "Cleanroom Operator"], "31", "EL",
                     {"Semiconductor Fab & OSAT": .95, "Quality Control": .4, "Electronics Assembly & Repair": .2, "Lean & Six Sigma": .2}, (2.5, 7), (0, 4), "semicon", 1),
    "iot_tech": (["IoT Technician", "Smart Meter Technician"], "74", "EL",
                 {"IoT": .9, "Electronics Assembly & Repair": .3, "Network Administration": .3, "Electrician (Wiring)": .3}, (2, 5), (0, 3), "urban", 1),
    "solar_tech": (["Solar PV Technician", "Solar Installer", "Rooftop Solar Technician"], "74", "GE",
                   {"Solar PV Installation": .95, "Electrician (Wiring)": .5, "Solar Plant O&M": .3, CC: .1}, (1.8, 4), (0, 3), "green", 4),
    "solar_om": (["Solar O&M Engineer", "Solar Plant Technician"], "31", "GE",
                 {"Solar Plant O&M": .9, "Solar PV Installation": .4, "Electrician (Wiring)": .3, "PLC & Industrial Automation": .3}, (2.5, 6), (1, 5), "green", 2),
    "ev_tech": (["EV Technician", "EV Service Engineer", "Battery Pack Technician"], "72", "GE",
                {"EV Battery & Powertrain": .95, "Automobile Servicing": .4, "Electrician (Wiring)": .3, "Electronics Assembly & Repair": .2}, (2, 5.5), (0, 4), "auto", 3),
    "wind_tech": (["Wind Turbine Technician"], "74", "GE",
                  {"Wind Turbine Maintenance": .95, "Electrician (Wiring)": .4, "Industrial Maintenance": .4}, (2.5, 6), (1, 5), "wind", 1),
    "energy_auditor": (["Energy Auditor", "Energy Engineer"], "21", "GE",
                       {"Energy Audit & Efficiency": .95, "Advanced Excel": .3, "Solar PV Installation": .2}, (4, 12), (2, 8), "mfg", 0.8),
    "h2_engineer": (["Green Hydrogen Engineer", "Electrolyser Technician"], "21", "GE",
                    {"Green Hydrogen": .95, "PLC & Industrial Automation": .3, "Industrial Maintenance": .2, "Energy Audit & Efficiency": .2}, (6, 18), (2, 8), "green", 0.4),
    "cnc_operator": (["CNC Operator", "VMC Operator", "CNC Programmer"], "72", "MF",
                     {"CNC Operation": .95, "Fitting & Machining": .3, "Quality Control": .3, "CAD Design (AutoCAD/SolidWorks)": .1}, (1.8, 4.5), (0, 5), "mfg", 5),
    "welder": (["Welder", "TIG Welder", "Fabrication Welder"], "72", "MF",
               {"Welding": .95, "Fitting & Machining": .3, "Quality Control": .1}, (1.6, 4), (0, 6), "mfg", 4),
    "fitter": (["Fitter", "Maintenance Fitter", "Machinist"], "72", "MF",
               {"Fitting & Machining": .9, "Industrial Maintenance": .4, "Welding": .2}, (1.6, 3.8), (0, 6), "mfg", 4),
    "maintenance_eng": (["Maintenance Engineer", "Maintenance Technician"], "31", "MF",
                        {"Industrial Maintenance": .9, "PLC & Industrial Automation": .4, "Electrician (Wiring)": .4, "Fitting & Machining": .3, "Lean & Six Sigma": .2}, (2.5, 7), (1, 8), "mfg", 3),
    "automation_eng": (["Automation Engineer", "PLC Programmer", "Instrumentation Technician"], "31", "MF",
                       {"PLC & Industrial Automation": .95, "Robotics": .25, "Industrial Maintenance": .3, "CAD Design (AutoCAD/SolidWorks)": .2, "Electrician (Wiring)": .2}, (3, 10), (1, 7), "mfg", 2.5),
    "qc_inspector": (["Quality Inspector", "QC Executive", "Quality Engineer"], "31", "MF",
                     {"Quality Control": .95, "Lean & Six Sigma": .4, "Advanced Excel": .3, "CAD Design (AutoCAD/SolidWorks)": .1}, (2, 6), (0, 6), "mfg", 3),
    "design_eng": (["Mechanical Design Engineer", "Draughtsman", "CAD Designer"], "21", "MF",
                   {"CAD Design (AutoCAD/SolidWorks)": .95, "Quality Control": .2, "Production Planning": .1}, (3, 9), (0, 6), "mfg", 2),
    "production_sup": (["Production Supervisor", "Production Engineer", "Shift Incharge"], "13", "MF",
                       {"Production Planning": .7, "Lean & Six Sigma": .5, "Quality Control": .4, LD: .5, "Advanced Excel": .3}, (3, 9), (2, 10), "mfg", 3),
    "machine_operator": (["Machine Operator", "Production Operator", "Assembly Line Operator"], "81", "MF",
                         {"Quality Control": .25, "Lean & Six Sigma": .15, "Industrial Maintenance": .15, "CNC Operation": .15}, (1.4, 2.8), (0, 3), "mfg", 7),
    "auto_mechanic": (["Automobile Mechanic", "Service Technician (Automobile)", "Two Wheeler Mechanic"], "72", "MF",
                      {"Automobile Servicing": .95, "EV Battery & Powertrain": .15, "Customer Service": .1}, (1.6, 4), (0, 5), "pop_urban", 4),
    "robotics_eng": (["Robotics Engineer", "Robot Programmer"], "21", "MF",
                     {"Robotics": .95, "PLC & Industrial Automation": .5, "Python": .3, "CAD Design (AutoCAD/SolidWorks)": .3}, (5, 15), (1, 6), "mfg", 0.8),
    "electrician": (["Electrician", "Wireman", "Industrial Electrician"], "74", "CO",
                    {"Electrician (Wiring)": .95, "Industrial Maintenance": .2, "HVAC & Refrigeration": .1, "Solar PV Installation": .08}, (1.6, 4), (0, 6), "pop_urban", 6),
    "plumber": (["Plumber", "Plumbing Technician"], "71", "CO", {"Plumbing": .95, "Masonry": .1}, (1.5, 3.5), (0, 6), "pop_urban", 3),
    "mason": (["Mason", "Construction Mason"], "71", "CO", {"Masonry": .95, "Bar Bending & Shuttering": .3}, (1.3, 3), (0, 8), "pop", 3),
    "carpenter": (["Carpenter", "Furniture Carpenter"], "71", "CO", {"Carpentry": .95}, (1.4, 3.2), (0, 8), "pop", 2),
    "hvac_tech": (["AC Technician", "HVAC Technician", "Refrigeration Mechanic"], "74", "CO",
                  {"HVAC & Refrigeration": .95, "Electrician (Wiring)": .4, "Customer Service": .1}, (1.8, 4.5), (0, 5), "urban", 3),
    "site_engineer": (["Site Engineer", "Site Supervisor", "Civil Supervisor"], "31", "CO",
                      {"Site Supervision": .9, "CAD Design (AutoCAD/SolidWorks)": .3, "Surveying": .3, "BIM": .1, LD: .3}, (2.5, 7), (1, 8), "pop_urban", 4),
    "surveyor": (["Land Surveyor", "Survey Engineer"], "31", "CO",
                 {"Surveying": .95, "CAD Design (AutoCAD/SolidWorks)": .4, "Precision Farming & Agri-Drones": .1}, (2.2, 5.5), (0, 6), "pop", 1.2),
    "bim_modeller": (["BIM Modeller", "Revit Designer"], "21", "CO", {"BIM": .95, "CAD Design (AutoCAD/SolidWorks)": .6}, (4, 10), (1, 6), "urban", 0.8),
    "bar_bender": (["Bar Bender", "Shuttering Carpenter", "Scaffolder"], "71", "CO",
                   {"Bar Bending & Shuttering": .95, "Carpentry": .2, "Masonry": .2}, (1.4, 3), (0, 6), "pop", 2),
    "staff_nurse": (["Staff Nurse", "ICU Nurse", "Nursing Officer"], "22", "HC", {"Nursing": .98, "Patient Care (GDA)": .4, CC: .2}, (2.4, 6), (0, 8), "pop", 6),
    "gda": (["General Duty Assistant", "Ward Assistant", "Patient Care Assistant"], "53", "HC",
            {"Patient Care (GDA)": .95, "Home Health & Elderly Care": .2}, (1.4, 2.6), (0, 3), "pop", 3),
    "lab_tech": (["Lab Technician", "Medical Lab Technician", "Phlebotomist"], "32", "HC",
                 {"Medical Lab Technology": .8, "Phlebotomy": .6}, (1.8, 4), (0, 5), "pop", 3),
    "pharmacist": (["Pharmacist", "Pharmacy Assistant"], "32", "HC", {"Pharmacy": .95, "Inventory Management": .3, "Customer Service": .2}, (1.8, 4.5), (0, 6), "pop", 2.5),
    "radiographer": (["Radiology Technician", "X-Ray Technician", "CT Technician"], "32", "HC", {"Radiology Technology": .95, "Patient Care (GDA)": .3}, (2, 5), (0, 6), "pop_urban", 1.5),
    "medical_coder": (["Medical Coder", "Medical Billing Executive"], "33", "HC", {"Medical Coding": .95, "Advanced Excel": .2, CC: .3}, (2.4, 6), (0, 4), "tech", 1.5),
    "home_care": (["Home Care Attendant", "Elderly Caregiver", "Home Health Aide"], "53", "HC",
                  {"Home Health & Elderly Care": .95, "Patient Care (GDA)": .4}, (1.4, 3), (0, 3), "pop_urban", 1.5),
    "emt": (["Emergency Medical Technician", "Paramedic"], "32", "HC", {"Emergency Medical Tech": .95, "Patient Care (GDA)": .3, "Commercial Driving": .1}, (2, 4.5), (0, 5), "pop", 1),
    "warehouse_assoc": (["Warehouse Associate", "Picker Packer", "Warehouse Executive"], "43", "LR",
                        {"Warehouse Management": .9, "Inventory Management": .5, "Forklift Operation": .2, CL: .2}, (1.4, 3), (0, 4), "logistics", 6),
    "supply_chain": (["Supply Chain Executive", "Procurement Executive", "Logistics Coordinator"], "33", "LR",
                     {"Supply Chain Management": .9, "Inventory Management": .4, "Advanced Excel": .5, "EXIM Documentation": .2, "CRM Tools": .1, CC: .3}, (3, 9), (1, 7), "urban", 3),
    "forklift_op": (["Forklift Operator", "Reach Truck Operator"], "83", "LR", {"Forklift Operation": .95, "Warehouse Management": .5}, (1.6, 3), (0, 5), "logistics", 1.5),
    "delivery": (["Delivery Executive", "Delivery Partner", "Courier Executive"], "83", "LR",
                 {"Last-mile Delivery": .95, "Commercial Driving": .3, RL: .3, "Customer Service": .2}, (1.4, 3), (0, 2), "pop_urban", 7),
    "retail_assoc": (["Retail Sales Associate", "Store Executive", "Visual Merchandiser"], "52", "LR",
                     {"Retail Sales": .9, "Customer Service": .5, "Inventory Management": .2, RL: .3, CC: .3}, (1.4, 3.2), (0, 4), "pop_urban", 6),
    "ecommerce_exec": (["E-commerce Executive", "Catalog Executive", "Marketplace Executive"], "33", "LR",
                       {"E-commerce Operations": .95, "Advanced Excel": .5, "Digital Marketing": .2}, (2, 5), (0, 4), "urban", 2),
    "driver": (["Truck Driver", "Commercial Vehicle Driver", "Cab Driver"], "83", "LR", {"Commercial Driving": .95, RL: .2}, (1.8, 4), (1, 10), "pop", 4),
    "exim_exec": (["Export Import Executive", "EXIM Documentation Executive", "Freight Forwarding Executive"], "33", "LR",
                  {"EXIM Documentation": .95, "Supply Chain Management": .3, "Advanced Excel": .3}, (2.4, 6), (1, 6), "ports", 1),
    "accountant": (["Accountant", "Accounts Executive", "Accounts Assistant"], "33", "BF",
                   {"Accounting": .9, "Tally": .7, "GST & Taxation": .6, "Advanced Excel": .5}, (2, 6), (0, 6), "pop_urban", 6),
    "fin_analyst": (["Financial Analyst", "FP&A Analyst", "Credit Analyst"], "24", "BF",
                    {"Financial Analysis": .9, "Advanced Excel": .7, "Accounting": .3, "Power BI": .2, "SQL": .1}, (5, 15), (1, 6), "tech", 2),
    "bank_ops": (["Banking Operations Executive", "Relationship Officer", "KYC Analyst"], "33", "BF",
                 {"Banking Operations": .9, "Customer Service": .4, "Field Sales & B2B": .2, CC: .3}, (2.2, 5.5), (0, 5), "pop_urban", 4),
    "insurance": (["Insurance Advisor", "Insurance Sales Executive"], "33", "BF",
                  {"Insurance Sales": .95, "Field Sales & B2B": .4, CC: .4, RL: .3}, (1.8, 4.5), (0, 5), "pop", 3),
    "collections": (["Collection Executive", "Microfinance Field Officer", "Loan Officer"], "33", "BF",
                    {"Microfinance & Collections": .9, "Field Sales & B2B": .3, RL: .4, "Banking Operations": .2}, (1.8, 3.6), (0, 4), "pop", 3),
    "auditor": (["Audit Associate", "Internal Auditor", "Article Assistant"], "24", "BF",
                {"Auditing": .9, "Accounting": .6, "GST & Taxation": .4, "Advanced Excel": .4}, (3, 10), (0, 6), "urban", 1.5),
    "digital_marketer": (["Digital Marketing Executive", "SEO Specialist", "Performance Marketer"], "24", "SM",
                         {"Digital Marketing": .95, "Content Writing": .3, "Graphic Design": .2, "Advanced Excel": .2, "Generative AI": .1}, (2.4, 8), (0, 5), "urban", 3),
    "customer_care": (["Customer Support Executive", "Customer Care Executive", "Chat Support Executive"], "42", "SM",
                      {"Customer Service": .95, CC: .7, "CRM Tools": .3, CL: .3, RL: .3}, (1.8, 4), (0, 3), "urban", 6),
    "telecaller": (["Telecaller", "BPO Voice Process Executive", "Tele Sales Executive"], "42", "SM",
                   {"Telecalling / Voice Process": .95, CC: .7, "Customer Service": .4, RL: .4}, (1.6, 3.2), (0, 3), "urban", 6),
    "field_sales": (["Sales Executive", "Business Development Executive", "Area Sales Manager"], "52", "SM",
                    {"Field Sales & B2B": .9, CC: .6, "CRM Tools": .3, RL: .3, "Advanced Excel": .1}, (2, 7), (0, 8), "pop_urban", 8),
    "content_writer": (["Content Writer", "Copywriter"], "26", "SM", {"Content Writing": .95, "Digital Marketing": .3, "Generative AI": .1, CC: .5}, (2.4, 6), (0, 5), "urban", 1.5),
    "graphic_designer": (["Graphic Designer", "Visualizer"], "21", "SM", {"Graphic Design": .95, "UI/UX Design": .2, "Digital Marketing": .1}, (2.4, 6), (0, 5), "urban", 2),
    "uiux_designer": (["UI/UX Designer", "Product Designer"], "21", "SM", {"UI/UX Design": .95, "Graphic Design": .3}, (5, 18), (1, 6), "tech", 1.5),
    "drone_pilot": (["Agri Drone Pilot", "Drone Operator", "Drone Technician"], "31", "AG",
                    {"Precision Farming & Agri-Drones": .95, "Surveying": .2, "Organic Farming": .05}, (2, 5), (0, 3), "agri", 1.2),
    "irrigation_tech": (["Drip Irrigation Technician", "Micro Irrigation Field Engineer"], "61", "AG",
                        {"Drip & Micro Irrigation": .95, "Agri Advisory & Sales": .3, "Plumbing": .1}, (1.6, 4), (0, 4), "agri", 1.5),
    "food_operator": (["Food Processing Operator", "Production Associate (Food)", "Packing Machine Operator"], "81", "AG",
                      {"Food Processing": .9, "Food Safety (FSSAI/HACCP)": .4, "Quality Control": .2}, (1.4, 3), (0, 4), "food", 5),
    "food_tech": (["Food Technologist", "QA Executive (Food)", "Food Safety Officer"], "21", "AG",
                  {"Food Safety (FSSAI/HACCP)": .8, "Food Processing": .6, "Quality Control": .5}, (3, 8), (1, 6), "food", 1.5),
    "dairy_tech": (["Dairy Plant Operator", "Dairy Technologist", "Milk Procurement Officer"], "75", "AG",
                   {"Dairy Technology": .95, "Food Safety (FSSAI/HACCP)": .3, "Quality Control": .2}, (1.8, 5), (0, 5), "dairy", 1.5),
    "agri_advisor": (["Agronomist", "Agri Sales Officer", "Field Officer (Agri)"], "21", "AG",
                     {"Agri Advisory & Sales": .9, "Field Sales & B2B": .3, "Organic Farming": .2, "Drip & Micro Irrigation": .2, RL: .4}, (2.4, 6), (0, 6), "agri", 2.5),
    "tractor_op": (["Tractor Operator", "Harvester Operator", "Farm Machinery Mechanic"], "83", "AG",
                   {"Farm Machinery Operation": .95, "Automobile Servicing": .2}, (1.4, 3), (0, 6), "agri", 1.5),
    "organic_sup": (["Organic Farm Supervisor", "Natural Farming Field Coordinator"], "61", "AG",
                    {"Organic Farming": .95, "Agri Advisory & Sales": .3}, (1.6, 3.6), (0, 5), "agri", 0.8),
    "cook": (["Commis Chef", "Cook", "Chef de Partie"], "51", "HT", {"Food Production (Cook/Chef)": .95, "Food Safety (FSSAI/HACCP)": .3}, (1.6, 4.5), (0, 6), "hospitality", 4),
    "fnb_steward": (["F&B Steward", "Waiter", "Restaurant Captain"], "51", "HT", {"F&B Service": .95, "Customer Service": .3, CC: .3}, (1.4, 3), (0, 4), "hospitality", 3),
    "housekeeping": (["Housekeeping Attendant", "Room Attendant", "Housekeeping Supervisor"], "51", "HT", {"Housekeeping": .95}, (1.4, 3), (0, 4), "hospitality", 3),
    "front_office": (["Front Office Executive", "Receptionist", "Guest Relations Executive"], "42", "HT",
                     {"Front Office": .95, CC: .6, CL: .3, "Customer Service": .3}, (1.8, 4), (0, 4), "hospitality", 2),
    "travel_consultant": (["Travel Consultant", "Tour Operations Executive", "Ticketing Executive"], "42", "HT",
                          {"Travel & Tour Operations": .95, "Customer Service": .3, CC: .5}, (2, 5), (0, 5), "hospitality", 1.2),
    "tailor": (["Sewing Machine Operator", "Tailor", "Stitching Operator"], "75", "TX", {"Sewing Machine Operation": .95, "Textile Quality Inspection": .1}, (1.3, 2.6), (0, 5), "textile", 6),
    "pattern_master": (["Pattern Master", "Cutting Master", "Pattern Maker"], "75", "TX",
                       {"Pattern Making & Cutting": .95, "Sewing Machine Operation": .3, "CAD Design (AutoCAD/SolidWorks)": .1}, (2, 5), (1, 8), "textile", 1.5),
    "textile_qc": (["Quality Checker (Garments)", "Fabric Inspector", "Textile Lab Technician"], "31", "TX",
                   {"Textile Quality Inspection": .95, "Quality Control": .4}, (1.6, 3.6), (0, 5), "textile", 2),
    "fashion_designer": (["Fashion Designer", "Apparel Merchandiser"], "21", "TX",
                         {"Fashion Design": .9, "Pattern Making & Cutting": .3, CC: .2}, (2.4, 7), (0, 6), "textile", 1.2),
    "weaver": (["Weaver", "Power Loom Operator", "Loom Jobber"], "73", "TX", {"Handloom & Weaving": .95}, (1.2, 2.4), (0, 8), "textile", 1.5),
}

# Growth (log-rate per year) for roles; emerging roles ramp with a logistic curve from `start`
ROLE_TREND = {
    "genai_engineer": ("ramp", "2023-03", 1.6), "data_scientist": ("lin", 0.10), "data_engineer": ("lin", 0.12),
    "cloud_devops": ("lin", 0.10), "cyber_analyst": ("lin", 0.14), "software_dev": ("lin", 0.02),
    "frontend_dev": ("lin", 0.03), "fullstack_dev": ("lin", 0.05), "qa_tester": ("lin", -0.04), "dotnet_dev": ("lin", -0.03),
    "vlsi_eng": ("ramp", "2023-10", 0.7), "semicon_tech": ("ramp", "2024-06", 1.1), "electronics_tech": ("lin", 0.14),
    "embedded_eng": ("lin", 0.08), "iot_tech": ("lin", 0.10),
    "solar_tech": ("ramp", "2023-06", 0.55), "solar_om": ("ramp", "2023-09", 0.45), "ev_tech": ("ramp", "2022-09", 0.5),
    "wind_tech": ("lin", 0.06), "energy_auditor": ("lin", 0.08), "h2_engineer": ("ramp", "2024-09", 0.9),
    "robotics_eng": ("lin", 0.16), "automation_eng": ("lin", 0.10), "cnc_operator": ("lin", 0.06), "machine_operator": ("lin", 0.02),
    "electrician": ("lin", 0.05), "hvac_tech": ("lin", 0.07), "bim_modeller": ("lin", 0.15), "site_engineer": ("lin", 0.05),
    "staff_nurse": ("lin", 0.06), "home_care": ("lin", 0.15), "medical_coder": ("lin", 0.08), "lab_tech": ("lin", 0.05),
    "warehouse_assoc": ("lin", 0.08), "delivery": ("lin", 0.07), "ecommerce_exec": ("lin", 0.06), "forklift_op": ("lin", 0.07),
    "telecaller": ("lin", -0.10), "customer_care": ("lin", -0.02), "weaver": ("lin", -0.08), "content_writer": ("lin", -0.05),
    "drone_pilot": ("ramp", "2023-09", 0.6), "food_operator": ("lin", 0.06), "food_tech": ("lin", 0.06), "organic_sup": ("lin", 0.08),
    "cook": ("lin", 0.05), "travel_consultant": ("lin", 0.06), "fnb_steward": ("lin", 0.03), "graphic_designer": ("lin", -0.01),
}
# state-specific extra growth (policy pushes, new plants) — the forecaster should pick these up
STATE_BOOST = {
    ("semicon_tech", "Gujarat"): 0.6, ("semicon_tech", "Assam"): 0.6, ("ev_tech", "Tamil Nadu"): 0.25,
    ("ev_tech", "Karnataka"): 0.2, ("solar_tech", "Rajasthan"): 0.25, ("solar_tech", "Punjab"): 0.35,
    ("solar_tech", "Uttar Pradesh"): 0.3, ("food_operator", "Punjab"): 0.2, ("food_operator", "Bihar"): 0.25,
    ("electronics_tech", "Uttar Pradesh"): 0.25, ("electronics_tech", "Tamil Nadu"): 0.2, ("genai_engineer", "Telangana"): 0.3,
    ("data_engineer", "Telangana"): 0.15, ("drone_pilot", "Punjab"): 0.3, ("drone_pilot", "Haryana"): 0.25,
    ("staff_nurse", "Uttar Pradesh"): 0.12, ("staff_nurse", "Bihar"): 0.15, ("warehouse_assoc", "Haryana"): 0.12,
    ("warehouse_assoc", "Uttar Pradesh"): 0.15, ("electrician", "Odisha"): 0.12, ("cnc_operator", "Haryana"): 0.1,
    ("h2_engineer", "Gujarat"): 0.4, ("h2_engineer", "Odisha"): 0.35, ("wind_tech", "Gujarat"): 0.12,
}
CLUSTER_SEASON = {  # month -> multiplier
    "LR": {9: 1.25, 10: 1.35, 11: 1.1, 1: 0.9}, "HT": {10: 1.2, 11: 1.25, 12: 1.2, 6: 0.85, 7: 0.8},
    "AG": {5: 1.15, 6: 1.25, 7: 1.15, 10: 1.15, 11: 1.1, 1: 0.85}, "SW": {12: 0.8, 1: 1.1, 4: 0.9},
    "DA": {12: 0.85, 1: 1.1}, "SM": {1: 1.1, 3: 1.1, 12: 0.85}, "CO": {7: 0.85, 8: 0.85, 11: 1.1, 2: 1.1},
}
# free-text skills that are NOT in the taxonomy; the emerging-term detector should discover them
NEW_TERMS = {
    "Agentic AI": (["genai_engineer", "data_scientist"], "2025-02", 0.55),
    "Vector Databases": (["genai_engineer", "data_engineer"], "2024-04", 0.45),
    "LangChain": (["genai_engineer"], "2023-09", 0.5),
    "Battery Recycling": (["ev_tech"], "2025-01", 0.3),
    "Green Building (IGBC)": (["site_engineer", "bim_modeller"], "2024-06", 0.25),
    "Drone Surveying": (["surveyor", "drone_pilot"], "2024-03", 0.35),
    "Digital Twin": (["automation_eng", "robotics_eng"], "2024-10", 0.3),
    "Heat Pump Installation": (["hvac_tech"], "2025-04", 0.2),
}
SALARY_PREMIUM = {  # multiplicative, the hedonic model should recover these
    "Generative AI": 1.18, "Kubernetes": 1.08, "VLSI Design": 1.10, "PLC & Industrial Automation": 1.08,
    "EV Battery & Powertrain": 1.07, "Solar Plant O&M": 1.05, "AWS": 1.07, "Big Data / Spark": 1.08,
    "Ethical Hacking": 1.09, "Power BI": 1.05, "CNC Operation": 1.05, "Robotics": 1.10, "MLOps": 1.10,
    "Tally": 1.03, "Advanced Excel": 1.03, "Communication (English)": 1.06, "Food Safety (FSSAI/HACCP)": 1.04,
    "Precision Farming & Agri-Drones": 1.08, "Cloud Security": 1.10, "BIM": 1.08,
}
METRO_PAY = {"Karnataka": 1.12, "Maharashtra": 1.1, "Delhi": 1.1, "Haryana": 1.08, "Telangana": 1.08, "Tamil Nadu": 1.03}

COMPANY_A = ["Apex", "Nova", "Sahyadri", "Indus", "Ganga", "Vindhya", "Kaveri", "Aravali", "Narmada", "Shakti", "Prithvi",
             "Akash", "Lotus", "Pragati", "Unnati", "Sarvodaya", "Nilgiri", "Konark", "Tapti", "Saffron", "Everest", "Deccan"]
COMPANY_B = {"SW": "Technologies", "DA": "Analytics", "CY": "Infosec", "EL": "Electronics", "GE": "Renewables", "MF": "Industries",
             "CO": "Infra Projects", "HC": "Hospitals", "LR": "Logistics", "BF": "Finserv", "SM": "Services", "AG": "Agro Foods",
             "HT": "Hotels & Resorts", "TX": "Textiles"}

# readable forms of each skill as recruiters write them (must be matched by the taxonomy regex)
SURFACE = {
    "Python": ["Python", "Python 3"], "SQL": ["SQL", "MySQL", "PostgreSQL"], "React": ["React.js", "ReactJS", "React"],
    "Node.js": ["Node.js", "NodeJS", "Express.js"], "AWS": ["AWS", "Amazon Web Services"], "Microsoft Azure": ["Azure", "Microsoft Azure"],
    "Google Cloud": ["GCP", "Google Cloud"], "DevOps & CI/CD": ["CI/CD", "Jenkins", "DevOps"], ".NET / C#": [".NET", "C#", "ASP.NET"],
    "Git": ["Git", "GitHub"], "REST APIs": ["REST APIs", "RESTful services"], "Mobile App Development": ["Android", "Flutter", "Kotlin"],
    "Software Testing": ["Selenium", "manual testing", "automation testing"], "Linux": ["Linux", "shell scripting"],
    "Machine Learning": ["Machine Learning", "ML models"], "Deep Learning": ["Deep Learning", "neural networks"],
    "Generative AI": ["Generative AI", "GenAI", "LLMs", "prompt engineering", "RAG pipelines"], "NLP": ["NLP", "natural language processing"],
    "Computer Vision": ["Computer Vision", "OpenCV", "object detection"], "Data Analysis": ["data analysis", "data analytics"],
    "Power BI": ["Power BI"], "Advanced Excel": ["Advanced Excel", "MS Excel", "VLOOKUP and pivot tables"],
    "Statistics": ["statistics", "statistical analysis"], "Big Data / Spark": ["Spark", "PySpark", "Hadoop", "Databricks"],
    "Data Engineering": ["ETL", "data pipelines", "Airflow", "data warehousing"], "TensorFlow / PyTorch": ["TensorFlow", "PyTorch"],
    "MLOps": ["MLOps", "model deployment"], "Cybersecurity": ["cyber security", "information security"],
    "Network Administration": ["networking", "CCNA", "firewalls"], "SOC & SIEM": ["SIEM", "Splunk", "SOC operations"],
    "Ethical Hacking": ["ethical hacking", "penetration testing", "VAPT"], "Cloud Security": ["cloud security", "zero trust"],
    "Hardware & Network Support": ["desktop support", "hardware and networking", "IT support"],
    "Embedded Systems": ["Embedded C", "microcontrollers", "embedded systems"], "VLSI Design": ["VLSI", "Verilog", "RTL design"],
    "PCB Design": ["PCB design", "Altium"], "Electronics Assembly & Repair": ["SMT", "soldering", "electronics assembly"],
    "IoT": ["IoT", "Internet of Things"], "Semiconductor Fab & OSAT": ["semiconductor", "cleanroom", "OSAT", "wire bonding"],
    "Solar PV Installation": ["solar PV", "rooftop solar", "solar panel installation"], "Solar Plant O&M": ["solar plant O&M", "O&M of solar plants"],
    "EV Battery & Powertrain": ["EV battery", "battery management system", "electric vehicles", "EV powertrain"],
    "Wind Turbine Maintenance": ["wind turbine"], "Energy Audit & Efficiency": ["energy audit", "energy efficiency"],
    "Green Hydrogen": ["green hydrogen", "electrolyser"], "CNC Operation": ["CNC", "VMC", "CNC programming"],
    "Welding": ["welding", "TIG", "MIG", "arc welding"], "Fitting & Machining": ["fitting", "machining", "lathe"],
    "CAD Design (AutoCAD/SolidWorks)": ["AutoCAD", "SolidWorks", "CATIA"], "PLC & Industrial Automation": ["PLC", "SCADA", "industrial automation"],
    "Quality Control": ["quality control", "QC", "quality inspection"], "Lean & Six Sigma": ["lean manufacturing", "Six Sigma", "Kaizen", "5S"],
    "Industrial Maintenance": ["preventive maintenance", "breakdown maintenance"], "Robotics": ["robotics", "robotic"],
    "Production Planning": ["production planning", "PPC"], "Automobile Servicing": ["automobile", "vehicle servicing"],
    "Electrician (Wiring)": ["electrician", "electrical wiring", "house wiring"], "Plumbing": ["plumbing"], "Masonry": ["masonry", "bricklaying"],
    "Carpentry": ["carpentry"], "HVAC & Refrigeration": ["HVAC", "refrigeration", "air conditioning"], "Site Supervision": ["site supervision"],
    "Surveying": ["surveying", "total station"], "BIM": ["BIM", "Revit"], "Bar Bending & Shuttering": ["bar bending", "shuttering", "scaffolding"],
    "Nursing": ["GNM", "B.Sc Nursing", "nursing"], "Patient Care (GDA)": ["patient care"], "Phlebotomy": ["phlebotomy", "blood collection"],
    "Medical Lab Technology": ["DMLT", "medical laboratory"], "Pharmacy": ["pharmacy", "dispensing"], "Radiology Technology": ["radiology", "CT scan"],
    "Medical Coding": ["medical coding", "ICD-10"], "Home Health & Elderly Care": ["elderly care", "home health aide"],
    "Emergency Medical Tech": ["EMT", "emergency medical technician"], "Warehouse Management": ["warehouse operations", "WMS"],
    "Inventory Management": ["inventory management", "stock management"], "Supply Chain Management": ["supply chain", "procurement"],
    "Forklift Operation": ["forklift", "reach truck"], "Last-mile Delivery": ["last mile delivery", "delivery executive"],
    "Retail Sales": ["retail sales", "store operations", "visual merchandising"], "E-commerce Operations": ["e-commerce", "catalog management"],
    "Commercial Driving": ["HMV licence", "commercial driving licence", "LMV"], "EXIM Documentation": ["EXIM", "export import", "customs clearance"],
    "Accounting": ["accounting", "bookkeeping", "accounts payable"], "Tally": ["Tally", "Tally Prime"], "GST & Taxation": ["GST", "TDS", "taxation"],
    "Financial Analysis": ["financial analysis", "financial modelling"], "Banking Operations": ["KYC", "banking operations", "loan processing"],
    "Insurance Sales": ["insurance sales"], "Auditing": ["auditing", "internal audit"], "Microfinance & Collections": ["collections", "microfinance"],
    "Digital Marketing": ["digital marketing", "SEO", "Google Ads"], "Customer Service": ["customer service", "customer support"],
    "Telecalling / Voice Process": ["telecalling", "voice process", "outbound calls"], "CRM Tools": ["CRM", "Salesforce", "Zoho"],
    "Field Sales & B2B": ["field sales", "B2B sales", "business development"], "Content Writing": ["content writing", "copywriting"],
    "Graphic Design": ["Photoshop", "graphic design", "CorelDRAW"], "UI/UX Design": ["Figma", "UI/UX", "wireframing"],
    "Precision Farming & Agri-Drones": ["agri drones", "drone operations", "precision farming"], "Drip & Micro Irrigation": ["drip irrigation", "micro irrigation"],
    "Food Processing": ["food processing"], "Food Safety (FSSAI/HACCP)": ["HACCP", "FSSAI", "food safety"], "Dairy Technology": ["dairy", "milk processing"],
    "Organic Farming": ["organic farming", "natural farming"], "Farm Machinery Operation": ["tractor", "farm machinery"],
    "Agri Advisory & Sales": ["agronomy", "crop advisory", "agri input sales"], "Food Production (Cook/Chef)": ["culinary", "kitchen operations"],
    "F&B Service": ["F&B service"], "Housekeeping": ["housekeeping"], "Front Office": ["front office", "guest relations"],
    "Travel & Tour Operations": ["ticketing", "tour operations"], "Sewing Machine Operation": ["sewing machine", "stitching"],
    "Pattern Making & Cutting": ["pattern making", "fabric cutting"], "Textile Quality Inspection": ["fabric inspection", "garment quality"],
    "Fashion Design": ["fashion design", "apparel design"], "Handloom & Weaving": ["weaving", "power loom"],
    "Communication (English)": ["communication skills", "spoken English", "written communication"], "Teamwork": ["teamwork", "team player"],
    "Problem Solving": ["problem solving", "analytical thinking"], "Leadership & People Management": ["team handling", "leadership"],
    "Project Management": ["Agile", "Scrum", "JIRA"], "Computer Literacy (MS Office)": ["MS Office", "basic computer knowledge", "data entry"],
    "Regional Language": ["Hindi", "local language", "Marathi", "Tamil", "Kannada", "Telugu", "Punjabi"],
}
TEMPLATES = [
    "Hands-on experience with {s}.", "Should be comfortable working with {s}.", "Strong knowledge of {s} is required.",
    "Exposure to {s} will be an added advantage.", "Candidate must have practical skills in {s}.",
    "You will work on {s} on a daily basis.", "Certification or training in {s} preferred.", "Good understanding of {s}.",
]
INTROS = [
    "{co} is hiring a {title} for our {city} {site}.", "Urgent opening for {title} at {co}, {city}.",
    "We are looking for a motivated {title} to join {co} in {city}.", "{co} ({city}) has an immediate requirement for a {title}.",
]
SITES = {"SW": "office", "DA": "office", "CY": "office", "EL": "plant", "GE": "project site", "MF": "plant", "CO": "project site",
         "HC": "hospital", "LR": "warehouse", "BF": "branch", "SM": "office", "AG": "unit", "HT": "property", "TX": "factory"}
OUTROS = [
    "Freshers with relevant training may apply.", "Salary as per industry standards. PF and ESI applicable.",
    "Immediate joiners preferred.", "Rotational shifts. Transport facility available.", "Excellent growth opportunities.",
    "Accommodation provided for outstation candidates.", "Walk-in interviews on weekdays.",
]


def _months():
    return pd.period_range(HISTORY_START, HISTORY_END, freq="M")


def _role_curve(role, months):
    t = np.array([(m.year - 2021) + (m.month - 1) / 12 for m in months])
    spec = ROLE_TREND.get(role, ("lin", 0.03))
    if spec[0] == "lin":
        c = np.exp(spec[1] * t)
    else:
        start = pd.Period(spec[1], "M")
        t0 = (start.year - 2021) + (start.month - 1) / 12
        c = 0.03 + 1 / (1 + np.exp(-spec[2] * 3 * (t - t0 - 1.0)))  # logistic ramp
        c = c / c[-1] * 1.0
    covid = np.where(t < 0.5, 0.82, np.where(t < 1.0, 0.92, 1.0))
    return c * covid


def _surface(skill, rng):
    forms = SURFACE.get(skill) or [skill.split(" (")[0]]
    return forms[rng.integers(len(forms))]


def generate_postings(monthly_base=2300, seed=SEED):
    """~160k synthetic postings Jan-2021..Oct-2026 with JD text, key-skill tags, location, salary."""
    rng = np.random.default_rng(seed)
    months = _months()
    prof = _profile_weights()
    states = geo.states()["state"].tolist()
    gaz_cities = pd.read_csv(geo.EXT / "final_cities.csv")
    gaz_cities["State"] = gaz_cities["State"].replace({"Jammu & Kashmir": "Jammu and Kashmir", "Andaman and Nicobar": "Andaman and Nicobar Islands"})
    metro = {"Karnataka": ("Bengaluru", 9.6e6), "Delhi": ("New Delhi", 1.1e7), "Maharashtra": ("Mumbai", 1.25e7),
             "Telangana": ("Hyderabad", 6.8e6), "Tamil Nadu": ("Chennai", 4.6e6), "West Bengal": ("Kolkata", 4.5e6),
             "Haryana": ("Gurugram", 1.2e6), "Uttar Pradesh": ("Noida", 6.4e5), "Kerala": ("Kochi", 6e5)}
    city_tab = {}
    for s in states:
        sub = gaz_cities[gaz_cities.State == s]
        names, pops = list(sub.City), list(sub.Population.astype(float))
        if s in metro:
            names.append(metro[s][0]); pops.append(metro[s][1])
        if not names:
            d = geo.districts(); dd = d[d.state == s]
            names, pops = list(dd.district), list(dd.pop2011 * 0.2)
        p = np.array(pops) ** 1.1
        city_tab[s] = (names, p / p.sum())
    total_w = sum(r[7] for r in ROLES.values())
    rows = []
    jid = 0
    for role, (titles, nco, cl, sk, sal, exp, profile, w) in ROLES.items():
        curve = _role_curve(role, months)
        pw = prof[profile].reindex(states).fillna(0).values
        for si, st in enumerate(states):
            boost = STATE_BOOST.get((role, st), 0.0)
            t = np.arange(len(months)) / 12
            lam = monthly_base * (w / total_w) * pw[si] * curve * np.exp(boost * t)
            season = np.array([CLUSTER_SEASON.get(cl, {}).get(m.month, 1.0) for m in months])
            lam = lam * season * rng.lognormal(0, 0.12, len(months))
            counts = rng.poisson(lam)
            for mi in np.nonzero(counts)[0]:
                for _ in range(counts[mi]):
                    rows.append((jid, role, st, mi)); jid += 1
    df = pd.DataFrame(rows, columns=["job_id", "role", "state", "mi"])
    n = len(df)
    out = {k: [None] * n for k in ("title", "company", "city", "date", "description", "key_skills", "skills_true",
                                   "salary_min_lpa", "salary_max_lpa", "exp_min", "nco_true", "cluster")}
    new_term_start = {k: pd.Period(v[1], "M") for k, v in NEW_TERMS.items()}
    for i, r in enumerate(df.itertuples()):
        titles, nco, cl, sk, sal, exp, profile, w = ROLES[r.role]
        m = months[r.mi]
        title = titles[rng.integers(len(titles))]
        if rng.random() < 0.15:
            title = ("Senior " if rng.random() < .5 else "Junior ") + title
        names, p = city_tab[r.state]
        city = names[rng.choice(len(names), p=p)]
        true = [s for s, pr in sk.items() if rng.random() < pr]
        if not true:
            true = [max(sk, key=sk.get)]
        for core in ("Communication (English)", "Teamwork", "Problem Solving"):
            if core not in true and rng.random() < 0.08:
                true.append(core)
        # trend: emerging skills appear more often over time in adjacent roles
        mention = []
        for s in true:
            mention.append(s)
        co = f"{COMPANY_A[rng.integers(len(COMPANY_A))]} {COMPANY_B.get(cl, 'Group')}"
        txt = [INTROS[rng.integers(len(INTROS))].format(co=co, title=title, city=city, site=SITES[cl])]
        tags = []
        for s in mention:
            form = _surface(s, rng)
            if rng.random() < 0.85:
                txt.append(TEMPLATES[rng.integers(len(TEMPLATES))].format(s=form))
            if rng.random() < 0.7:
                tags.append(_surface(s, rng))
        for term, (roles_, start, rate) in NEW_TERMS.items():
            if r.role in roles_ and m >= new_term_start[term]:
                age = (m - new_term_start[term]).n / 12
                if rng.random() < min(0.6, 0.05 + rate * age):
                    tags.append(term)
                    txt.append(f"Knowledge of {term} is a plus.")
        e0 = int(rng.integers(exp[0], exp[1] + 1))
        txt.append(f"Experience: {e0}-{e0 + int(rng.integers(1, 4))} years.")
        txt.append(OUTROS[rng.integers(len(OUTROS))])
        mid = txt[1:-2]
        rng.shuffle(mid)
        txt = [txt[0]] + mid + txt[-2:]
        # salary
        base = rng.uniform(sal[0], sal[1]) * (1 + 0.06 * e0)
        base *= METRO_PAY.get(r.state, 0.96)
        for s in true:
            base *= SALARY_PREMIUM.get(s, 1.0)
        base *= 1.04 ** ((m.year - 2021) + m.month / 12)  # wage inflation
        disclosed = rng.random() < 0.45
        out["title"][i] = title
        out["company"][i] = co
        out["city"][i] = city
        out["date"][i] = m.to_timestamp() + pd.Timedelta(days=int(rng.integers(0, 28)))
        out["description"][i] = " ".join(txt)
        out["key_skills"][i] = ", ".join(dict.fromkeys(tags))
        out["skills_true"][i] = "|".join(true)
        out["salary_min_lpa"][i] = round(base * 0.85, 2) if disclosed else np.nan
        out["salary_max_lpa"][i] = round(base * 1.15, 2) if disclosed else np.nan
        out["exp_min"][i] = e0
        out["nco_true"][i] = nco
        out["cluster"][i] = cl
    for k, v in out.items():
        df[k] = v
    df["source"] = "synthetic"
    df["job_id"] = "S" + df["job_id"].astype(str)
    return df.drop(columns=["mi"])


# --------------------------------------------------------------------------- PLFS-format workforce sample
_NCO3 = {"11": [111, 112], "12": [121, 122], "13": [131, 132, 133, 134], "14": [141, 142, 143], "21": [211, 212, 213, 214, 215, 216],
         "22": [221, 222, 226], "23": [231, 232, 233, 234, 235], "24": [241, 242, 243], "25": [251, 252], "26": [261, 263, 264, 265],
         "31": [311, 312, 313, 314, 315], "32": [321, 322, 325], "33": [331, 332, 333, 334, 335], "34": [341, 342, 343],
         "35": [351, 352], "41": [411, 412, 413], "42": [421, 422], "43": [431, 432], "44": [441], "51": [511, 512, 513, 514, 515, 516],
         "52": [521, 522, 523, 524], "53": [531, 532], "54": [541], "61": [611, 612, 613], "62": [621, 622], "63": [631, 632, 633, 634],
         "71": [711, 712, 713], "72": [721, 722, 723], "73": [731, 732], "74": [741, 742], "75": [751, 752, 753, 754],
         "81": [811, 812, 813, 814, 815, 816, 817, 818], "82": [821], "83": [831, 832, 833, 834, 835], "91": [911, 912],
         "92": [921], "93": [931, 932, 933], "94": [941], "95": [951, 952], "96": [961, 962]}
_OCC_BASE = {"61": .40, "92": .13, "63": .02, "62": .01, "93": .085, "71": .05, "72": .022, "73": .012, "74": .016, "75": .03,
             "81": .016, "82": .006, "83": .045, "91": .02, "94": .004, "95": .012, "96": .012, "52": .075, "51": .026, "53": .006,
             "54": .008, "41": .008, "42": .006, "43": .007, "44": .004, "31": .010, "32": .006, "33": .012, "34": .004, "35": .004,
             "21": .006, "22": .004, "23": .022, "24": .006, "25": .007, "26": .004, "11": .008, "12": .006, "13": .012, "14": .016}
_URBAN_MULT = {"61": .08, "92": .1, "63": .05, "62": .2, "25": 4, "24": 3.5, "21": 3, "33": 3, "35": 3, "41": 3, "42": 3.5,
               "43": 3, "52": 1.7, "51": 2, "53": 2, "54": 2, "12": 2.5, "13": 2, "14": 1.8, "22": 2, "32": 1.8, "74": 1.6,
               "72": 1.6, "75": 1.4, "81": 1.6, "82": 2, "83": 1.3, "91": 2, "96": 1.5}
_EDU_MULT = {"low": {"61": 1.4, "92": 1.8, "93": 1.6, "71": 1.5, "91": 1.6, "21": .02, "22": .02, "23": .05, "24": .03, "25": .01, "33": .1, "31": .2},
             "secondary": {"52": 1.3, "83": 1.3, "72": 1.3, "74": 1.3, "41": 1.2, "42": 1.2, "25": .15, "21": .2},
             "graduate": {"61": .4, "92": .1, "93": .1, "71": .2, "21": 6, "22": 5, "23": 7, "24": 7, "25": 8, "26": 5, "31": 3,
                          "32": 3, "33": 4, "35": 4, "41": 3, "42": 3, "12": 4, "13": 2}}
_STATE_UR = {"Kerala": 2.0, "Goa": 1.8, "Himachal Pradesh": 1.5, "Jammu and Kashmir": 1.6, "Punjab": 1.4, "Haryana": 1.4,
             "Uttarakhand": 1.4, "Bihar": 1.3, "Odisha": 1.2, "Rajasthan": 1.2, "Delhi": 1.1, "Assam": 1.2, "Manipur": 1.4,
             "Nagaland": 1.6, "Andaman and Nicobar Islands": 1.5, "Gujarat": 0.6, "Madhya Pradesh": 0.7, "Chhattisgarh": 0.7,
             "Karnataka": 0.8, "Maharashtra": 0.85, "Tamil Nadu": 0.95}
_TILT = {"25": "tech", "24": "tech", "35": "tech", "75": "textile", "73": "textile", "61": "agri", "92": "agri",
         "72": "mfg", "81": "mfg", "82": "electronics", "51": "hospitality", "74": "mfg", "83": "logistics", "43": "logistics"}


def _edu_band(e):
    return "low" if e <= 7 else ("secondary" if e <= 11 else "graduate")


def generate_plfs(seed=SEED):
    """Person-level sample with PLFS-style fields and weights (Multiplier ~ persons represented)."""
    rng = np.random.default_rng(seed + 1)
    st = geo.states().set_index("state")
    prof = _profile_weights()
    popshare = st["pop2011"] / st["pop2011"].sum()
    occs = list(_OCC_BASE)
    base = np.array([_OCC_BASE[o] for o in occs])
    recs = []
    d = geo.districts()
    for s, row in st.iterrows():
        n = int(max(400, 2.6 * row.pop2011 ** 0.5))
        wa_pop = row.pop2011 * 1.17 * 0.67   # 2026 working-age (15-64) approx.
        w = wa_pop / n
        urb = float(row.urban_share) * 1.35 + 0.08
        tilt = np.ones(len(occs))
        for j, o in enumerate(occs):
            if o in _TILT:
                ratio = prof[_TILT[o]][s] / popshare[s]
                tilt[j] = np.clip(ratio, 0.2, 5) ** 0.5
        dist = d[d.state == s]
        dprob = (dist.pop2011 / dist.pop2011.sum()).values if len(dist) else None
        for _ in range(n):
            sector = 2 if rng.random() < urb else 1
            sex = 1 if rng.random() < 0.51 else 2
            age = int(np.clip(rng.gamma(4.2, 7.2) + 15, 15, 64))
            young = age < 30
            # education: younger + urban -> more educated; Kerala/Delhi/Goa/HP higher
            edu_boost = {"Kerala": 1.2, "Delhi": 1.0, "Goa": 0.9, "Himachal Pradesh": 0.7, "Bihar": -0.6, "Uttar Pradesh": -0.3,
                         "Rajasthan": -0.3, "Jharkhand": -0.3, "Madhya Pradesh": -0.3, "Tamil Nadu": 0.4, "Maharashtra": 0.3}.get(s, 0)
            z = rng.normal(0.4 * (sector == 2) + 0.6 * young + edu_boost * 0.5 - 0.2 * (sex == 2), 1.0)
            gen_edu = 1 if z < -1.0 else 6 if z < -0.4 else 7 if z < 0.1 else 8 if z < 0.55 else 10 if z < 1.0 else 11 if z < 1.15 else 12 if z < 1.75 else 13
            tech_edu = 1
            if gen_edu >= 12 and rng.random() < 0.30:
                tech_edu = int(rng.choice([3, 4, 2, 6, 13, 16], p=[.5, .12, .05, .18, .1, .05]))
            elif gen_edu in (10, 11) and rng.random() < 0.18:
                tech_edu = int(rng.choice([8, 9, 7, 10, 11], p=[.5, .15, .08, .12, .15]))
            voc = 6
            r = rng.random()
            p_formal = 0.03 + 0.05 * (gen_edu >= 10) + 0.03 * young
            if r < p_formal:
                voc = 1
            elif r < p_formal + 0.05:
                voc = int(rng.choice([2, 3, 4, 5], p=[.3, .3, .3, .1]))
            voc_field = 0
            if voc <= 5:
                fw = np.ones(25)
                fw[[15, 11, 17, 12, 22, 8, 19, 7]] = [6, 5, 4, 3.5, 3, 2.5, 2.5, 2]
                fw[22] *= np.clip(prof["textile"][s] / popshare[s], .3, 3)
                fw[15] *= np.clip(prof["tech"][s] / popshare[s], .3, 3)
                fw[1] *= np.clip(prof["agri"][s] / popshare[s], .3, 3); fw[2] *= np.clip(prof["agri"][s] / popshare[s], .3, 3)
                voc_field = int(rng.choice(np.arange(1, 26), p=fw / fw.sum()))
            # labour force status
            lfpr = (0.93 if sex == 1 else 0.38) * (0.62 if age < 22 else 1.0) * (0.75 if age > 58 else 1.0)
            if rng.random() > lfpr:
                status = int(rng.choice([91, 92, 93, 97]))
                nco = None
            else:
                ur = 0.018 * (3.6 if young else 1) * (2.4 if gen_edu >= 12 else 1.4 if gen_edu >= 10 else 0.6) * (1.4 if sector == 2 else 1)
                ur *= _STATE_UR.get(s, 1.0) * (1.25 if sex == 2 else 1)
                if rng.random() < min(ur, 0.45):
                    status, nco = 81, None
                else:
                    band = _edu_band(gen_edu)
                    p = base * tilt
                    if sector == 2:
                        p = p * np.array([_URBAN_MULT.get(o, 1.0) for o in occs])
                    p = p * np.array([_EDU_MULT[band].get(o, 1.0) for o in occs])
                    if tech_edu in (4, 9, 14):
                        p = p * np.array([8 if o in ("22", "32") else 1 for o in occs])
                    if voc_field:
                        hint = {16: ["25", "35", "41"], 12: ["74", "31"], 18: ["72", "81"], 13: ["32", "53"], 23: ["75"], 6: ["75"], 14: ["51"], 8: ["72"], 17: ["83", "43"], 11: ["71"]}.get(voc_field, [])
                        p = p * np.array([3 if o in hint else 1 for o in occs])
                    o = occs[rng.choice(len(occs), p=p / p.sum())]
                    nco = int(rng.choice(_NCO3[o]))
                    status = int(rng.choice([11, 12, 21, 31, 41, 51], p=[.38, .02, .06, .23, .02, .29]))
            dt = dist.iloc[rng.choice(len(dist), p=dprob)].dt_code if dprob is not None else None
            recs.append((s, dt, sector, sex, age, gen_edu, tech_edu, voc, voc_field, status, nco, w))
    cols = ["State", "District", "Sector", "Sex", "Age", "General_Education_Level", "Technical_Education_Level",
            "Vocational_Training", "Field_of_Training", "Principal_Status_Code", "NCO_2015_3d", "Multiplier"]
    df = pd.DataFrame(recs, columns=cols)
    df["source"] = "synthetic"
    return df


# --------------------------------------------------------------------------- ITIs & polytechnics
def generate_training_centres(seed=SEED):
    from shapely.geometry import Point, shape
    from shapely.prepared import prep

    rng = np.random.default_rng(seed + 2)
    d = geo.districts()
    g = geo.districts_geo()
    polys = {f["properties"]["dt_code"]: shape(f["geometry"]) for f in g["features"]}
    prof = _profile_weights()
    popshare = geo.states().set_index("state")["pop2011"]; popshare = popshare / popshare.sum()
    state_iti = {"Rajasthan": 1.8, "Uttar Pradesh": 1.3, "Madhya Pradesh": 1.3, "Maharashtra": 1.1, "Karnataka": 1.4,
                 "Tamil Nadu": 0.8, "Odisha": 1.3, "Bihar": 1.4, "Punjab": 1.1, "Haryana": 1.2, "Kerala": 0.6,
                 "West Bengal": 0.4, "Assam": 0.25, "Gujarat": 0.9, "Jharkhand": 0.8, "Telangana": 0.6, "Andhra Pradesh": 0.7}
    trades = list(ITI_TRADE_WEIGHTS)
    tw = np.array([ITI_TRADE_WEIGHTS[t] for t in trades], float)
    poly_branches = {"Civil Engineering": ["CAD Design (AutoCAD/SolidWorks)", "Surveying", "Site Supervision"],
                     "Mechanical Engineering": ["CAD Design (AutoCAD/SolidWorks)", "Fitting & Machining", "Production Planning"],
                     "Electrical Engineering": ["Electrician (Wiring)", "Industrial Maintenance", "Solar PV Installation"],
                     "Electronics & Communication": ["Embedded Systems", "Electronics Assembly & Repair", "IoT"],
                     "Computer Science": ["Python", "SQL", "Hardware & Network Support"]}
    rows = []
    for r in d.itertuples():
        n_iti = rng.poisson(13000 * (r.pop2011 / d.pop2011.sum()) * state_iti.get(r.state, 1.0) * 1.08)
        n_poly = rng.poisson(3500 * (r.pop2011 / d.pop2011.sum()) * (0.7 + 0.6 * (state_iti.get(r.state, 1.0) > 1)))
        poly = polys.get(r.dt_code)
        pp = prep(poly) if poly is not None else None
        minx, miny, maxx, maxy = poly.bounds if poly is not None else (r.lon - .2, r.lat - .2, r.lon + .2, r.lat + .2)

        def pt():
            for _ in range(60):
                x, y = rng.uniform(minx, maxx), rng.uniform(miny, maxy)
                if pp is None or pp.contains(Point(x, y)):
                    return round(x, 4), round(y, 4)
            return round(r.lon, 4), round(r.lat, 4)

        for k in range(n_iti):
            ty = "Govt ITI" if rng.random() < 0.24 else "Private ITI"
            # trades tilted by local industry
            w = tw.copy()
            for j, t in enumerate(trades):
                if t in ("Sewing Technology", "Fashion Design & Technology"):
                    w[j] *= np.clip(prof["textile"][r.state] / popshare[r.state], .3, 3)
                if t in ("Solar Technician (Electrical)", "Mechanic Electric Vehicle"):
                    w[j] *= np.clip(prof["green"][r.state] / popshare[r.state], .3, 3)
                if t == "Drone Technician":
                    w[j] *= np.clip(prof["agri"][r.state] / popshare[r.state], .3, 3)
            nt = int(rng.integers(2, 7 if ty == "Govt ITI" else 4))
            ts = list(rng.choice(trades, size=nt, replace=False, p=w / w.sum()))
            x, y = pt()
            seats = {t: int(rng.choice([20, 24, 40, 48], p=[.4, .3, .2, .1])) for t in ts}
            rows.append({"centre_id": f"T{len(rows)}", "name": f"{ty} {r.district} {k + 1}", "type": ty, "state": r.state,
                         "dt_code": r.dt_code, "district": r.district, "lon": x, "lat": y,
                         "trades": "|".join(ts), "seats": int(sum(seats.values())),
                         "skills": "|".join(sorted({s for t in ts for s in ITI_TRADES[t]})),
                         "utilisation": round(float(np.clip(rng.normal(0.68 if ty == "Private ITI" else 0.82, 0.15), 0.2, 1.0)), 2)})
        for k in range(n_poly):
            bs = list(rng.choice(list(poly_branches), size=int(rng.integers(2, 5)), replace=False))
            x, y = pt()
            rows.append({"centre_id": f"T{len(rows)}", "name": f"Polytechnic {r.district} {k + 1}", "type": "Polytechnic",
                         "state": r.state, "dt_code": r.dt_code, "district": r.district, "lon": x, "lat": y,
                         "trades": "|".join(bs), "seats": int(60 * len(bs)),
                         "skills": "|".join(sorted({s for b in bs for s in poly_branches[b]})),
                         "utilisation": round(float(np.clip(rng.normal(0.72, 0.15), 0.2, 1.0)), 2)})
    df = pd.DataFrame(rows)
    df["source"] = "synthetic"
    return df


def check_surface_forms():
    """Every readable surface form must be caught by its own taxonomy regex (guards the NLP tests)."""
    bad = []
    for s in SKILLS:
        rx = re.compile(r"(?<![\w.#+])(?:" + s["pattern"] + r")(?![\w+#])", re.I)
        for f in SURFACE.get(s["name"], [s["name"].split(" (")[0]]):
            if not rx.search(f):
                bad.append((s["name"], f))
    return bad
