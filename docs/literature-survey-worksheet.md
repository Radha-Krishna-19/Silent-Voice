# Literature survey worksheet — rubric rows 2, 5 and 12

**Worth 5 + 3 + 2 = 10 of the 50 marks, and it is the only block of work I cannot do for you.**

Rows 5 and 12 both depend on this row. Row 5 needs "best values discussed for
the metric in the papers"; row 12 needs one of these five nominated as the
standard paper. Finish row 2 and all three close together.

---

## Why I have not filled this in for you

The rubric asks for papers **from a journal listed on scimagojr.com in
2025/2026**. Two things about that cannot be established from a search result
snippet:

1. **Whether the journal is in the SCImago listing for that year.** SCImago's
   ranking is published annually and journals move in and out of it. The only
   way to know is to look the journal up on scimagojr.com.
2. **The actual publication year of the actual article.** Search engines
   routinely surface a 2021 paper alongside 2025 text, or show an "online
   first" date that differs from the issue date.

If I wrote five polished citations here, they would look finished, and a
plausible-looking citation that turns out to be from 2022 — or in a journal
that is not indexed — is worse than an empty row, because you would not check
it. So below is a **shortlist of real candidates with URLs I actually
retrieved**, plus exactly what to do with them.

---

## Step 1 — Verify the journal, then the paper

For each candidate:

1. Open the URL. Confirm it loads and is the paper you think it is.
2. Note the **journal name** and the **article's publication year**.
3. Go to <https://www.scimagojr.com/journalsearch.php> and search the journal
   name. Confirm it appears, and note its **quartile (Q1–Q4)** and **SJR
   score** — quoting the quartile in your slide is a cheap way to show you
   actually did the check.
4. Only if steps 2 and 3 both pass does the paper go in the deck.

Aim to end with **five papers that survive all four steps.** Over-collect:
start with eight or nine candidates, expect a third to fail.

---

## Step 2 — Candidate shortlist

These came out of real searches. **Every one is unverified for both indexing
and year** — that is your job above.

| # | Candidate | Where I found it | Why it is relevant to *your* architecture |
|---|---|---|---|
| A | *MP-GestLSTM: real time gesture detection using MediaPipe and LSTM* | [Taylor & Francis, Systems Science & Control Engineering](https://www.tandfonline.com/doi/full/10.1080/21642583.2025.2587853) | Closest match to your pipeline: MediaPipe landmarks into an LSTM. Directly comparable to your Model A. |
| B | *Sign Language Recognition based on Deep Learning via MediaPipe* | [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S187705092600044X) | MediaPipe front-end, deep classifier. Check the year carefully — the identifier suggests 2026. |
| C | *Video-Based Arabic Sign Language Recognition with MediaPipe and Deep Learning* | [MDPI, Journal of Imaging](https://doi.org/10.3390/jimaging12040177) | Same landmark front-end on a different sign language — good for arguing your method generalises. MDPI journals are SCImago-indexed. |
| D | *Enhancing Indian sign language recognition through data augmentation and visual transformer* | [Neural Computing and Applications](https://link.springer.com/article/10.1007/s00521-024-09845-1) | ISL specifically, reports 97.52%. NCA is solidly indexed — but check the year, it may be 2024. |
| E | *Skeleton-based sign language recognition using a dual-stream spatio-temporal dynamic graph convolutional network* | [arXiv 2509.08661](https://arxiv.org/abs/2509.08661) | Skeleton-only, like yours. **arXiv is not a journal** — find the journal version or drop it. |
| F | *A deep sign language recognition system for Indian sign language* | [Neural Computing and Applications](https://link.springer.com/article/10.1007/s00521-022-07840-y) | ISL, well cited. Almost certainly 2022 — likely fails the year test, listed as a fallback only. |
| G | *Benchmarking deep neural network approaches for Indian Sign Language recognition* | [Neural Computing and Applications](https://dl.acm.org/doi/10.1007/s00521-020-05448-8) | A benchmarking paper — the closest in spirit to your controlled comparison. 2021, so it fails the year test, but it is the best **methodological** precedent to cite in your discussion. |

### If you need more candidates

Search Scopus or Google Scholar with the year filter set to 2025–2026 and terms
like:

```
"sign language recognition" AND (BiLSTM OR "temporal convolutional") AND skeleton
"isolated sign language recognition" AND landmarks AND 2025
"Indian sign language" AND deep learning AND 2025
MediaPipe AND "sign language" AND (LSTM OR CNN) AND journal
```

Then filter to journals only, and run each through scimagojr.com.

---

## Step 3 — Record these fields per paper

The deck slide needs a table. Collect this for each of the five:

| Field | Why the rubric wants it |
|---|---|
| Authors, title, journal, year, DOI | The citation itself |
| SCImago quartile and SJR | Proves you did the indexing check |
| Dataset used | Lets you say whether the number is comparable to yours |
| Architecture | This is what row 2 means by "related to your deep learning architecture" |
| Reported accuracy / F1 / latency | **This is what row 5 needs** for its "best values in the papers" column |
| One-line relation to your work | Turns a list into a survey |

---

## Step 4 — Feed row 5

Row 5 wants a metrics table with a **"best value discussed in the papers"**
column. Once you have the five papers, fill in the highest reported value you
found for each metric:

| Metric | Your BiLSTM | Your 1-D CNN | Best in the surveyed papers |
|---|---|---|---|
| Accuracy | 91.74% | 94.55% | *(from the papers)* |
| Top-5 accuracy | 97.66% | 98.44% | *(often not reported — say so)* |
| Macro F1 | 0.9140 | 0.9433 | *(from the papers)* |
| Latency | 4.12 ms | 0.74 ms | *(rarely reported — say so)* |

**Where a paper does not report a metric, write "not reported" rather than
leaving a blank.** Noticing that most sign-language papers never publish
latency is itself a finding, and it is a point in your favour: you measured it.

**Be careful comparing accuracies across different datasets.** A 99% on
INCLUDE-50 is not better than your 94.55% on the full 261 classes — it is an
easier problem. Say that explicitly; examiners look for it.

---

## Step 5 — Row 12, the standard paper

Pick whichever of your five is closest to what you built and justify it in two
or three sentences. Candidate G above is the strongest *methodological*
precedent even if it fails the year test for row 2 — a benchmarking comparison
is exactly what your project is.

The justification should say: what the paper does, what you took from it, and
where you diverge. "We adopt its evaluation protocol but replace X with Y" is a
good sentence.

---

## The one thing not to do

Do not cite a paper you have not opened. Examiners ask "what did paper three
actually do?" and a wrong answer costs far more than the mark for the row.
