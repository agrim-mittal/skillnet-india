"""Job title -> NCO-2015 sub-major group classifier.

This is the bridge between job postings (demand, described in titles and skills) and PLFS (supply,
described in NCO occupation codes). TF-IDF (word + char n-grams) on the title, plus the extracted
skills as tokens, fed to a multinomial logistic regression.
"""
import numpy as np
import pandas as pd
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score

from .reference import NCO_GROUPS

# Hand-written seed titles so every NCO group is represented (incl. ones job portals rarely post)
SEED_TITLES = {
    "11": ["Chief Executive Officer", "Managing Director", "Director General", "Country Head", "CEO", "Chief Operating Officer"],
    "12": ["HR Manager", "Finance Manager", "Marketing Manager", "Sales Manager", "Admin Manager", "Head of Data", "Engineering Manager", "Product Manager", "Analytics Manager", "Director Data Science"],
    "13": ["Plant Manager", "Production Manager", "IT Manager", "Construction Manager", "Logistics Manager", "Operations Manager"],
    "14": ["Hotel Manager", "Store Manager", "Restaurant Manager", "Retail Branch Manager"],
    "21": ["Mechanical Engineer", "Civil Engineer", "Electrical Engineer", "Research Scientist", "Chemist", "Architect", "Electronics Engineer", "Agronomist"],
    "22": ["Doctor", "Medical Officer", "Staff Nurse", "Dentist", "Physiotherapist", "Dietitian"],
    "23": ["Teacher", "Lecturer", "Assistant Professor", "PGT Mathematics", "Primary Teacher", "Trainer"],
    "24": ["Chartered Accountant", "Financial Analyst", "HR Executive", "Business Analyst", "Management Consultant", "Data Analyst", "Marketing Analyst"],
    "25": ["Software Engineer", "Data Scientist", "Web Developer", "Database Administrator", "Machine Learning Engineer", "Cloud Architect"],
    "26": ["Lawyer", "Legal Advisor", "Journalist", "Content Writer", "Social Worker", "Librarian", "Translator"],
    "31": ["Lab Assistant", "Draughtsman", "Quality Inspector", "Site Supervisor", "Electrical Technician", "Diploma Engineer Trainee"],
    "32": ["Lab Technician", "Pharmacist", "Radiographer", "Paramedic", "Optometrist", "ANM"],
    "33": ["Accounts Executive", "Insurance Agent", "Sales Coordinator", "Purchase Executive", "Tax Assistant", "Loan Officer"],
    "34": ["Paralegal", "Photographer", "Fitness Trainer", "Chef Instructor", "Sports Coach"],
    "35": ["IT Support Technician", "Network Technician", "Desktop Support Engineer", "Broadcast Technician"],
    "41": ["Office Assistant", "Data Entry Operator", "Typist", "Clerk", "Computer Operator"],
    "42": ["Receptionist", "Customer Care Executive", "Call Centre Executive", "Telecaller", "Bank Teller"],
    "43": ["Store Keeper", "Stock Clerk", "Billing Executive", "Payroll Clerk", "Warehouse Assistant"],
    "44": ["Mail Clerk", "Library Clerk", "Records Assistant"],
    "51": ["Cook", "Waiter", "Housekeeping Attendant", "Beautician", "Hair Stylist", "Travel Guide"],
    "52": ["Salesman", "Shop Assistant", "Retail Sales Associate", "Cashier", "Sales Executive", "Counter Sales"],
    "53": ["Caregiver", "Child Care Worker", "Patient Care Assistant", "Ayah", "Home Health Aide"],
    "54": ["Security Guard", "Security Supervisor", "Fire Fighter", "Bouncer"],
    "61": ["Farmer", "Dairy Farmer", "Horticulture Worker", "Poultry Farmer", "Orchard Grower"],
    "62": ["Fisherman", "Forest Worker", "Fish Farmer"],
    "63": ["Subsistence Farmer"],
    "71": ["Mason", "Carpenter", "Plumber", "Painter", "Tile Fitter", "Construction Worker"],
    "72": ["Welder", "Fitter", "Machinist", "Motor Mechanic", "Blacksmith", "Turner"],
    "73": ["Potter", "Handicraft Worker", "Printer", "Weaver", "Jeweller"],
    "74": ["Electrician", "Electronics Mechanic", "Lineman", "Solar Installer", "Wireman"],
    "75": ["Tailor", "Baker", "Butcher", "Furniture Maker", "Dairy Plant Operator", "Garment Worker"],
    "81": ["Machine Operator", "Boiler Operator", "Packing Machine Operator", "Plant Operator", "Textile Machine Operator"],
    "82": ["Assembler", "Assembly Line Worker", "Electronics Assembler"],
    "83": ["Driver", "Truck Driver", "Forklift Operator", "Crane Operator", "Tractor Driver", "Delivery Boy"],
    "91": ["Cleaner", "Domestic Help", "Sweeper", "Office Boy", "Car Washer"],
    "92": ["Farm Labourer", "Agricultural Labourer", "Plantation Worker"],
    "93": ["Helper", "Construction Labourer", "Loader", "Packer", "Factory Helper"],
    "94": ["Kitchen Helper", "Fast Food Preparer"],
    "95": ["Street Vendor", "Hawker"],
    "96": ["Garbage Collector", "Watchman", "Peon", "Messenger"],
}


class OccupationClassifier:
    def __init__(self):
        self.word = TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True, lowercase=True)
        self.char = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), min_df=2, sublinear_tf=True, max_features=40000)
        self.skill = TfidfVectorizer(tokenizer=lambda s: s.split("|"), lowercase=False, token_pattern=None)
        self.clf = LogisticRegression(max_iter=600, C=6.0)

    @staticmethod
    def _skills_str(skills):
        return ["|".join(s) if len(s) else "none" for s in skills]

    def _X(self, titles, skills, fit=False):
        sk = self._skills_str(skills)
        if fit:
            return hstack([self.word.fit_transform(titles), self.char.fit_transform(titles), 0.6 * self.skill.fit_transform(sk)]).tocsr()
        return hstack([self.word.transform(titles), self.char.transform(titles), 0.6 * self.skill.transform(sk)]).tocsr()

    def fit(self, titles, skills, y):
        X = self._X(list(titles), list(skills), fit=True)
        self.clf.fit(X, list(y))
        return self

    def predict_proba(self, titles, skills):
        return self.clf.predict_proba(self._X(list(titles), list(skills)))

    def predict(self, titles, skills):
        P = self.predict_proba(titles, skills)
        idx = P.argmax(1)
        return self.clf.classes_[idx], P.max(1)


def training_frame(synth_df):
    seed = [(t, [], g) for g, ts in SEED_TITLES.items() for t in ts]
    seed_df = pd.DataFrame(seed * 6, columns=["title", "skills", "nco"])  # upweight seeds
    syn = synth_df[["title", "skills", "nco_true", "role"]].rename(columns={"nco_true": "nco"})
    return syn, seed_df


def train_and_evaluate(synth_df, seed=42):
    """Returns fitted classifier + metrics: random split and leave-roles-out (unseen job families)."""
    syn, seed_df = training_frame(synth_df)
    rng = np.random.default_rng(seed)
    sample = syn.sample(min(len(syn), 60000), random_state=seed)
    # 1) random split
    msk = rng.random(len(sample)) < 0.8
    tr, te = sample[msk], sample[~msk]
    m = OccupationClassifier().fit(pd.concat([tr.title, seed_df.title]), list(tr.skills) + list(seed_df.skills), pd.concat([tr.nco, seed_df.nco]))
    p, _ = m.predict(te.title, te.skills)
    rand_acc = accuracy_score(te.nco, p)
    # 2) leave 20% of roles out entirely -> tests generalisation to job titles never seen in training
    roles = sample.role.unique()
    held = set(rng.choice(roles, size=max(1, len(roles) // 5), replace=False))
    tr2, te2 = sample[~sample.role.isin(held)], sample[sample.role.isin(held)]
    m2 = OccupationClassifier().fit(pd.concat([tr2.title, seed_df.title]), list(tr2.skills) + list(seed_df.skills), pd.concat([tr2.nco, seed_df.nco]))
    p2, _ = m2.predict(te2.title, te2.skills)
    lro_acc = accuracy_score(te2.nco, p2)
    lro_f1 = f1_score(te2.nco, p2, average="macro")
    # final model on everything
    final = OccupationClassifier().fit(pd.concat([sample.title, seed_df.title]), list(sample.skills) + list(seed_df.skills), pd.concat([sample.nco, seed_df.nco]))
    metrics = {"model": "TF-IDF (word 1-2g + char 2-4g + skills) -> multinomial logistic regression",
               "accuracy_random_split": round(rand_acc, 3), "accuracy_unseen_job_families": round(lro_acc, 3),
               "macro_f1_unseen_job_families": round(lro_f1, 3), "n_train": int(len(sample) + len(seed_df)),
               "n_classes": int(len(final.clf.classes_))}
    return final, metrics


def nco_name(code):
    return NCO_GROUPS.get(str(code), str(code))
