"""手动采集锁定版本；不自动追踪 latest，不修改旧参考数据。"""
import concurrent.futures
from datetime import datetime, timezone
from html import unescape
import json
from pathlib import Path
import re
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PATCH = "16.21.1"
BASE = f"https://ddragon.leagueoflegends.com/cdn/{PATCH}"
CACHE = ROOT / ".cache" / PATCH
PUBLIC = ROOT / "public"

# 未核验的形态/重施放交互不参与排名；不声称此清单穷尽所有例外。
FORM_CHAMPIONS = {
    "Jayce", "Nidalee", "Elise", "Gnar", "Shyvana", "Udyr", "Aphelios", "Hwei",
}
# 旧抓取器把内部施法限制用的 ammo 字段也视为可储存充能。
# 这些槽位不使用旧充能时间；普通 CD 仍来自本次 DDragon。
INTERNAL_AMMO = {("Karthus", "Q"), ("Leblanc", "R"),
                 ("Rengar", "Q"), ("Rengar", "W"), ("Rengar", "E"),
                 ("Warwick", "W")}
REVIEW_SLOTS = {
    "Ahri": "R", "Akali": "ER", "Aatrox": "Q", "Anivia": "R",
    "AurelionSol": "Q", "Bard": "W", "Belveth": "R", "Briar": "WE",
    "Camille": "Q", "Darius": "R", "Ezreal": "Q", "Gangplank": "E", "Gragas": "Q",
    "Gwen": "R", "Irelia": "Q", "Ivern": "Q", "Janna": "Q",
    "Karma": "R", "Karthus": "E", "Kassadin": "E", "Katarina": "E",
    "Kennen": "E", "Kled": "QW",
    "KSante": "R", "Leblanc": "WR", "LeeSin": "QWE", "MasterYi": "Q",
    "Naafiri": "W", "Neeko": "W", "Nunu": "WR",
    "Olaf": "R", "Pantheon": "Q", "Pyke": "QR", "Qiyana": "W", "RekSai": "QWER",
    "Renata": "Q", "Renekton": "E", "Rengar": "QWE", "Riven": "QR", "Samira": "R",
    "Shaco": "R", "Singed": "Q", "Sion": "Q",
    "Skarner": "Q", "Swain": "R", "Sylas": "R",
    "TahmKench": "R", "Taliyah": "Q", "Talon": "E",
    "Taric": "Q", "Tristana": "W", "TwistedFate": "W",
    "Urgot": "WR", "Varus": "Q", "Vex": "R", "Viego": "R", "Vladimir": "E",
    "Volibear": "Q", "Warwick": "Q", "Wukong": "R", "Xerath": "QR",
    "Yasuo": "Q", "Yone": "Q", "Yorick": "Q", "Yuumi": "W",
    "Zac": "E", "Zed": "WR", "Zeri": "Q", "Zilean": "W", "Zoe": "Q",
}


def get(url, destination):
    if destination.exists():
        return destination.read_bytes()
    error = None
    for attempt in range(5):
        try:
            request_url = url if attempt == 0 else f"{url}?archmage_retry={attempt}"
            request = urllib.request.Request(request_url, headers={"User-Agent": "ArchmageLab/1.0"})
            with urllib.request.urlopen(request, timeout=12) as response:
                content = response.read()
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
            return content
        except Exception as exc:
            error = exc
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"{url}: {error}")


def plain(value):
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    return unescape(re.sub(r"<[^>]*>", "", value)).strip()


def icon(image):
    if not re.fullmatch(r"[A-Za-z0-9_-]+\.png", image["sprite"]):
        raise ValueError("不安全的图标文件名")
    if not all(type(image[key]) is int and image[key] >= 0 for key in ("x", "y", "w", "h")):
        raise ValueError("图标坐标必须是非负整数")
    return {key: image[key] for key in ("sprite", "x", "y", "w", "h")}


def normalize(champion, old_by_id):
    key = champion["id"]
    previous = old_by_id.get(int(champion["key"]), {})
    old_spells = {spell["slot"]: spell for spell in previous.get("spells", [])}
    spells = []
    for slot, spell in zip("QWER", champion["spells"]):
        prior = old_spells.get(slot, {})
        charged = prior.get("charged", False) and (key, slot) not in INTERNAL_AMMO
        cooldowns = spell.get("cooldown", [])
        source = "Data Dragon"
        notes = []
        if charged:
            cooldowns = prior.get("cooldownByLevel") or []
            source = "用户旧快照 / Community Dragon 充能回复时间"
            notes.append("充能技能：按恢复一层时间代入普通 CD 模型，实际交互待核验")
        valid = (len(cooldowns) == spell["maxrank"]
                 and all(isinstance(c, (int, float)) and c > 0 for c in cooldowns))
        review = key in FORM_CHAMPIONS or slot in REVIEW_SLOTS.get(key, "")
        if not valid:
            status = "missing"
            notes.append("未取得完整且非零的逐级 CD，暂不参与计算")
        elif review and not charged:
            status = "review"
            notes.append("形态、重施放、属性或条件冷却交互待核验，暂不参与排名")
        else:
            status = "charge" if charged else "standard"
        spells.append({
            "slot": slot, "name": spell["name"], "description": plain(spell["description"]),
            "maxRank": spell["maxrank"], "cooldowns": cooldowns, "icon": icon(spell["image"]),
            "status": status, "notes": notes, "source": source,
        })
    return {
        "id": key, "numericId": int(champion["key"]), "name": champion["name"],
        "title": champion["title"], "tags": champion["tags"],
        "icon": icon(champion["image"]), "spells": spells,
    }


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    index = json.loads(get(f"{BASE}/data/zh_CN/champion.json", CACHE / "index.json"))["data"]
    legacy_path = ROOT / "reference/lol-archmage-refund/data/champions_spells.json"
    # 旧快照只用于充能字段，不执行参考程序。没有旧文件时使用已归档的充能来源快照。
    charge_snapshot = ROOT / "data" / f"charge-source-{PATCH}.json"
    if legacy_path.exists() and not charge_snapshot.exists():
        legacy = json.loads(legacy_path.read_text())
        if legacy.get("patch") != PATCH:
            raise RuntimeError("充能来源与本次版本不同，拒绝混用；请先准备同版本来源")
        rows = [{"championId": c["championId"],
                 "spells": [s for s in c["spells"] if s.get("charged")]}
                for c in legacy["champions"]]
        charge_snapshot.parent.mkdir(exist_ok=True)
        charge_snapshot.write_text(json.dumps([c for c in rows if c["spells"]],
                                             ensure_ascii=False, indent=2))
    if not charge_snapshot.exists():
        raise RuntimeError("缺少同版本充能来源快照，请先核验后准备，不能静默当作普通技能")
    legacy = json.loads(charge_snapshot.read_text())
    old = {c["championId"]: c for c in legacy}

    def fetch(key):
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9]*", key):
            raise ValueError("不安全的英雄 ID")
        content = get(f"{BASE}/data/zh_CN/champion/{key}.json", CACHE / f"{key}.json")
        champion = json.loads(content)["data"][key]
        return normalize(champion, old)

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        champions = list(pool.map(fetch, sorted(index)))
    sprites = {c["icon"]["sprite"] for c in champions}
    sprites.update(s["icon"]["sprite"] for c in champions for s in c["spells"])
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda name: get(f"{BASE}/img/sprite/{name}",
                                      PUBLIC / "assets" / name), sorted(sprites)))
    counts = {status: sum(s["status"] == status for c in champions for s in c["spells"])
              for status in ("standard", "charge", "review", "missing")}
    payload = {
        "patch": PATCH,
        "fetchedAt": datetime.fromtimestamp(max(p.stat().st_mtime for p in CACHE.glob("*.json")),
                                            timezone.utc).isoformat(),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": f"{BASE}/data/zh_CN/champion/",
        "modeVerified": False, "counts": counts, "champions": champions,
    }
    out = PUBLIC / "data" / "champions.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print(json.dumps({"champions": len(champions), "sprites": len(sprites),
                      "status": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
