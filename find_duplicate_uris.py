"""
Find possibly duplicate URIs in the corpus;
or, given a new URI, find possible matches among the URIs already in the corpus.

TO DO: manuscript URIs!
"""

from openiti.helper.funcs import get_all_yml_files_in_folder
import os
import re
from itertools import combinations
from collections import Counter
import math
import json
import sys
import csv


def split_name(s, merge_w_next=None, merge_w_prev=None):
    name_parts = []
    name_part = ""
    for part in re.split(r"\s|(?=[A-Z])", s.strip()):
        if part.strip() == "":
            continue
        name_part += part
        if merge_w_next and part in merge_w_next:
            continue
        if merge_w_prev and part in merge_w_prev:
            if name_parts:
                last_name = name_parts.pop(-1)
            else:
                print("---", s)
                last_name = ""
            name_part = last_name + part
        name_parts.append(name_part)
        name_part = ""
    return name_parts
    

def parse_author_uri(uri, merge_w_next=["Abu", "Abi", "Ibn", "Cabd"],
                     merge_w_prev=["Din", "Dawla", "Li"], fp=None):
    """Parse the elements of an author URI

    Args:
        uri (str): an OpenITI author uri
        merge_w_next (list): listed name elements will be merged
            with the following name element
        merge_w_prev (list): listed name elements will be merged
            with the previous name element
        fp (str): path to the author yml file (optional)

    Returns: dict
    """
    try:
        date = int(uri[:4])
    except:
        return None
    name = uri[4:]

    # split the name into parts:
    name_parts = split_name(name, merge_w_next=merge_w_next, merge_w_prev=merge_w_prev)
##    name_parts = []
##    name_part = ""
##    for part in re.split(r"(?=[A-Z])", name):
##        if part.strip() == "":
##            continue
##        name_part += part
##        if merge_w_next and part in merge_w_next:
##            continue
##        if merge_w_prev and part in merge_w_prev:
##            last_name = name_parts.pop(-1)
##            name_part = last_name + part
##        name_parts.append(name_part)
##        name_part = ""
    
    return {
        "uri": uri,
        "date": date,
        "uri_name": name,
        "uri_parts": name_parts,
        "uri_token_set": set(name_parts),
        "path": fp,
        "books": None
    }


def parse_path(fp, merge_w_next=["Abu", "Abi", "Ibn", "Cabd"],
                     merge_w_prev=["Din", "Dawla", "Li"]):
    """Parse the elements of an author yml path

    Args:
        fp (str): path to the author yml file
        merge_w_next (list): listed name elements will be merged
            with the following name element
        merge_w_prev (list): listed name elements will be merged
            with the previous name element

    Returns: dict
    """
    uri = os.path.split(fp)[-1].split(".")[0]
    return parse_author_uri(uri, merge_w_next=merge_w_next,
                            merge_w_prev=merge_w_prev, fp=fp)


def get_books(auth_yml_fp):
    """Get all of an author's books."""
    author_folder = os.path.split(auth_yml_fp)[0]
    books = get_all_yml_files_in_folder(author_folder, ["book"])
    return [os.path.split(fp)[-1].split(".")[1] for fp in books]


def build_author_token_weights(records):
    """Create a dictionary with weights for each token (IDF)"""
    # count how many records each token appears in
    #token_counts = Counter(
    #    token
    #    for rec in records
    #    for token in rec["name_parts"]
    #)
    #N = len(records) or 1
    N = 0
    token_counts = Counter()
    for rec in records:
        N += 1
        for token in rec["uri_parts"]:
            token_counts[token] += 1
        if "name_parts" in rec:
            for token in rec["name_parts"]:
                token_counts[token] += 1

    # simple IDF-style weight: rarer tokens get higher weight
    token_weights = {
        token: math.log(1.0 + N / (1.0 + count))
        for token, count in token_counts.items()
    }
    print("heighest weight:", max(token_weights.values()))
    print("lowest weight:", min(token_weights.values()))
    return token_weights, token_counts

def build_book_token_weights(records):
    """Create a dictionary with weights for each token (IDF)"""
    # count how many records each token appears in
    N = 0
    uri_part_counter = Counter()
    title_part_counter = Counter()
    for rec in records:
        for book in rec["books"]:
            N += 1
            for token in rec["books"][book]["uri_parts"]:
                uri_part_counter[token] += 1
            for token in rec["books"][book]["title_parts"]:
                title_part_counter[token] += 1

    title_part_counter.update(uri_part_counter)

    # simple IDF-style weight: rarer tokens get higher weight
    token_weights = {
        token: math.log(1.0 + N / (1.0 + count))
        for token, count in title_part_counter.items()
    }
    print("heighest weight:", max(token_weights.values()))
    print("lowest weight:", min(token_weights.values()))
    return token_weights, title_part_counter

def weighted_jaccard(parts_a, parts_b, weights):
    """Jaccard similarity of sets: number of items in the intersection of the sets
    divided by number of items in the union

    this is a variant, in which we add the weight of each token instead of counting items
    in intersection and union"""
    sa = {p for p in parts_a}
    sb = {p for p in parts_b}
    if not sa or not sb:
        return 0.0

    inter = sa & sb
    union = sa | sb
    num = sum(weights.get(t, 1.0) for t in inter)
    den = sum(weights.get(t, 1.0) for t in union)
    return num / den if den else 0.0


def rare_subset(parts_a, parts_b, weights, rare_weight_threshold):
    """
    Check if the set of *rare* tokens of the shorter name
    is a subset of the rare tokens of the longer name.
    """
    sa = {p for p in parts_a}
    sb = {p for p in parts_b}

    # identify "rare" tokens in each name
    rare_a = {t for t in sa if weights.get(t, 0.0) >= rare_weight_threshold}
    rare_b = {t for t in sb if weights.get(t, 0.0) >= rare_weight_threshold}

    # always compare smaller → larger
    if len(rare_a) <= len(rare_b):
        small, big = rare_a, rare_b
    else:
        small, big = rare_b, rare_a

    if not small:
        return False
    return small.issubset(big)


def add_candidate(candidates, r1, r2, reason, extra=None):
    entry = {
        "uri1": r1["uri"],
        "uri2": r2["uri"],
        "date1": r1["date"],
        "date2": r2["date"],
        "uri_name1": r1["uri_name"],
        "uri_name2": r2["uri_name"],
        "uri_parts1": r1["uri_parts"],
        "uri_parts2": r2["uri_parts"],
        "books1": r1["books"],
        "books2": r2["books"],
        "path1": r1["path"],
        "path2": r2["path"],
        "reason": reason,
    }
    if extra:
        entry.update(extra)
    candidates.append(entry)

def store_cache(records, year_index, token_weights, json_fp):
    serializable = []
    for rec in records:
        serializabele_rec = {k:v for k,v in rec.items() if k != "uri_token_set"}
        serializable.append(serializabele_rec)
        
    data = {
        "records": serializable,
        "year_index": year_index,
        "token_weights": token_weights
        }
    with open(json_fp, mode="w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)

def load_cache(json_fp):
    with open(json_fp, mode="r", encoding="utf-8") as file:
        data = json.load(file)
    records = []
    for rec in data["records"]:
        rec["uri_token_set"] = set(rec["name_parts"])
        records.append(rec)
    year_index = dict()
    for k,v in data["year_index"].items():
        year_index[int(k)] = v
        
    return records, year_index, data["token_weights"]
    

def find_possible_duplicates(
        records,
        year_index,
        token_weights,
        record_to_compare=None,
        max_year_diff=10,
        same_year_wj_threshold=0.4,
        close_year_wj_threshold=0.5,
        rare_weight_threshold=1.0,   # what "rare" means
        ignore_same_uris=True
    ):
    """
    Find possible duplicates within a given set of records
    
    Args:
        records (list): list of dicts from parse_uri.
        year_index(dict): key: year, value: list of indexes of the records list
    
    Returns list of candidate pairs with diagnostics.
    """


    years = sorted(year_index.keys())

    # filter the records to be compared by date:
    filtered_pairs = []
    if record_to_compare:
        # compare the given record only with records within max_year_diff:
        y1 = record_to_compare["date"]
        filtered_years = [y2 for y2 in years if abs(y1-y2) <= max_year_diff]
        for y2 in filtered_years:
            for idx2 in year_index[y2]:
                filtered_pairs.append((record_to_compare, records[idx2]))
    else:
        # compare any given record only with records within max_year_diff:
        for i_y, y1 in enumerate(years):
            for y2 in years[i_y:]:
                if abs(y1 - y2) > max_year_diff:
                    break  # years sorted, so we can stop here
                for i in year_index[y1]:
                    for j in year_index[y2]:
                        filtered_pairs.append((records[i], records[j]))

    # check the similarity of the filtered URI pairs:
    candidates = []
    for r1, r2 in filtered_pairs:
        # exact same URI:
        if r1["uri"] == r2["uri"]:
            if not ignore_same_uris:
                add_candidate(
                    candidates, r1, r2, "same_uri",
                    {"weighted_jaccard": None, "rare_subset": None}
                )
            continue

        # must share at least one token:
        if not (r1["uri_token_set"] & r2["uri_token_set"]):
            continue

        wj = weighted_jaccard(r1["name_parts"], r2["name_parts"], token_weights)
        rare_sub = rare_subset(
            r1["name_parts"], r2["name_parts"],
            token_weights,
            rare_weight_threshold,
        )

        y1 = r1["date"]
        y2 = r2["date"]
        if y1 == y2:
            # same year: we can be more permissive
            if wj >= same_year_wj_threshold or rare_sub:
                add_candidate(
                    candidates, r1, r2, "same_year",
                    {"weighted_jaccard": wj, "rare_subset": rare_sub}
                )
        else:
            # close years
            if wj >= close_year_wj_threshold or rare_sub:
                add_candidate(
                    candidates, r1, r2, "close_years",
                    {
                        "year_diff": abs(y1 - y2),
                        "weighted_jaccard": wj,
                        "rare_subset": rare_sub,
                    }
                )

    return candidates

def get_records_from_metadata(csv_fp, sep="\t", ignore_parts=["Multiple", "Anonymous", "Anon"]):
    records = dict()

    merge_w_next = ["Abu", "Abi", "Abū", "Abī", "Ibn", "ibn", "b.", "ʿAbd", "Cabd",
                    "أبو", "أبي", "ابن", "بن", "عبد", "ابی", "ابو",  "أبو"]
    merge_w_prev = ["al-Dīn", "al-Dawla", "li-", "الدين", "الدولة"]
    
    # gather author and book metadata from the metadata file:
    with open(meta_fp, encoding="utf-8") as file:
        for row in csv.DictReader(file, delimiter=sep):
            version_url = row["url"]
            # create a record for each author:
            book_folder, version_fn = os.path.split(version_url)
            if version_fn.startswith("MS"):
                continue
            author_folder, book_uri = os.path.split(book_folder)
            _, author_uri = os.path.split(author_folder)
            name_parts = []
            if author_uri not in records:
                #print(author_uri)
                records[author_uri] = parse_path(version_url + "/" + author_uri+".yml")
                #print(records[author_uri])
                name_parts = []
                for lang in ["lat", "ar"]:
                    names = [name for name in row[f"author_{lang}"].split(" :: ") if name]
                    for name in names:
                        name_parts += split_name(name, merge_w_next=merge_w_next,
                                                 merge_w_prev=merge_w_prev)
                    records[author_uri][f"name_{lang}"] = list(set(names))
                records[author_uri]["name_parts"] = list(set(name_parts))
                records[author_uri]["books"] = {}
            # add book metadata:
            book_uri = row["book"]
            title_uri = book_uri.split(".")[1]
            book_d = {"book_uri": book_uri, "title_uri": title_uri, "title_lat": [], "title_ar": []}
            book_d = records[author_uri]["books"].get(book_uri, book_d)
            if not "uri_parts" in book_d:
                book_d["uri_parts"] = split_name(title_uri,
                                                 merge_w_next=merge_w_next,
                                                 merge_w_prev=None)
            title_parts = []
            for lang in ["lat", "ar"]:
                titles = [title for title in row[f"title_{lang}"].split(" :: ") if title]
                for title in titles:
                    title_parts += split_name(title,
                                              merge_w_next=merge_w_next,
                                              merge_w_prev=None)
                book_d[f"title_{lang}"] = list(set(book_d[f"title_{lang}"] + titles))
            book_d["title_parts"] = list(set(title_parts))
            records[author_uri]["books"][book_uri] = book_d

    # turn the dictionary into a list:
    records = list(records.values())

    # calculate the token weights:
    token_weights, token_counts = build_author_token_weights(records)

    # calculate token weights for the book URI and titles:
    book_token_weights, book_token_counts = build_book_token_weights(records)
    token_weights.update(book_token_weights)
    token_counts.update(book_token_counts)

    # Index by year to reduce comparisons
    year_index = build_year_index(records, ignore_parts=ignore_parts)
    
    return records, year_index, token_weights

def build_year_index(records, ignore_parts=["Multiple", "Anonymous", "Anon"]):
    year_index = {}
    for i, rec in enumerate(records):
        year = rec["date"]
        add = True
        for ign in ignore_parts:
            if ign in rec["name_parts"]:
                add = False
        if add:
            if year not in year_index:
                year_index[year] = []
            year_index[year].append(i)
    return year_index
    

def prepare(folder=None, meta_fp=None, json_fp=None, ignore_parts=["Multiple", "Anonymous", "Anon"]):
    if json_fp:
        return load_cache(json_fp)

    if meta_fp:
        return get_records_from_metadata(meta_fp, ignore_parts=ignore_parts)
    
    # create a record for each author yml file:
    records = [parse_path(fp) for fp in get_all_yml_files_in_folder(folder, ["author"])]
    records = [rec for rec in records if rec is not None]


    # add the titles of the book for each author
    #records = [add_books(rec) for rec in records if rec is not None]
    for rec in records:
        rec["books"] = get_books(rec["path"])

    token_weights, token_counts = build_author_token_weights(records)

    # Index by year to reduce comparisons
    year_index = build_year_index(records, ignore_parts=ignore_parts)

    return records, year_index, token_weights

if __name__ == "__main__":
    #folder = "."
    #records, year_index, token_weights = prepare(folder=folder)
    #records, year_index, token_weights = prepare(json_fp="uri_data.json")
    meta_fp = r"C:\Users\peter.verkinderen\OneDrive - Aga Khan University\Documents\_home_admin-kitab_Documents_OpenITI_RELEASE_git_working_dir_AH_repos_metadata_light.csv"
    records, year_index, token_weights = prepare(meta_fp=meta_fp)
    print(len(records))
    store_cache(records, year_index, token_weights, "uri_data.json")


    # find all possible duplicate author URIs in the corpus:
    candidates = find_possible_duplicates(records, year_index, token_weights)

    # find all possible matching IDs for a given author URI:
    record = parse_author_uri("0309CadudDawlaMuwaffaqLiDinAbuJacfarCabdAllahTabari")
    #candidates = find_possible_duplicates(records, year_index, token_weights,
    #                                      record_to_compare=record, ignore_same_uris=False)
    for c in candidates:
        print(json.dumps(c, indent=2))


    

