# Manual Test Plan — Silent Voice

Automated tests cannot judge a real person signing to a real webcam, or how the
app feels to use. These manual tests cover that. **Execution record:** fill in
the Actual, Result and Date columns when you run each test, and save one
screenshot per test in `docs/testing/evidence/manual/` named after its ID
(e.g. `MT-06.png`). Leave a test as "Not run" rather than guessing.

Setup: start the app with `run-windows.bat` (Windows) or `./run-mac.sh` (Mac),
or open the hosted link once the backend is deployed.

| ID | Area | Steps | Expected result | Actual | Result | Date |
|---|---|---|---|---|---|---|
| MT-01 | Start-up | Run the launcher | Browser opens; About/Research show both models loaded | | Not run | |
| MT-02 | Gate | Click "Continue as guest" | Home page opens, nothing saved to the server | | Not run | |
| MT-03 | Accounts | Create an account, sign out, sign in again | Sign-in works; wrong password is rejected with a clear message | | Not run | |
| MT-04 | Camera permission | Open Live, click the camera button, **deny** permission | Clear "camera blocked" message, no fake captions | | Not run | |
| MT-05 | Live recognition | Allow camera, sign HELLO facing the camera | Caption "hello" appears within a few seconds | | Not run | |
| MT-06 | Live recognition | Sign 5 different words from the vocabulary, one at a time | Record how many of the 5 are captioned correctly | | Not run | |
| MT-07 | Two-handed sign | Sign any two-handed word from the vocabulary | Correct caption; both hands drawn in the overlay | | Not run | |
| MT-08 | Empty scene | Step out of the frame for 10 s | No new captions appear | | Not run | |
| MT-09 | Lighting | Repeat MT-05 in dim light | Record result; overlay shows if hands are lost | | Not run | |
| MT-10 | Sentence | Sign 2-3 words, pause | A sentence is formed from the words | | Not run | |
| MT-11 | Reverse | Type "where is the doctor tomorrow", click Sign it | Gloss TOMORROW DOCTOR WHERE; available signs play | | Not run | |
| MT-12 | Reverse | Type a word outside the vocabulary | Reported as not in vocabulary, not invented | | Not run | |
| MT-13 | Practice | Pick a word, attempt it, get a score | Score shown against the reference recording | | Not run | |
| MT-14 | Contribute | Enter a word, record a clip | "Saved" message; review-queue count increases | | Not run | |
| MT-15 | Offline backend | Stop the backend, reload Live | Page says the server is unreachable, no fake output | | Not run | |
| MT-16 | Hosted link | Open the GitHub Pages link on a phone | Pages load; first request may take ~1 min while the server wakes | | Not run | |
| MT-17 | Live accuracy | Sign 20 different words from the vocabulary one at a time, lowering hands between words, 2 signers if possible | Record correct/20 per signer. This is the live accuracy figure; nothing may be claimed before it is measured | | Not run | |
| MT-18 | Distance | Repeat 5 words at arm's length, then sitting close (face fills frame) | Captions still appear for both distances; note any drop | | Not run | |
| MT-19 | Left-handed | Sign 5 words left-handed with the Settings toggle off, then on | Toggle on reads noticeably better | | Not run | |
| MT-20 | Segmentation | Sign two words back to back with a pause and hands lowered | Two separate captions, one per word; hands kept up produces one long guess, as documented | | Not run | |

## Qualitative usability observations
After the session, note briefly (1-5 scale plus a sentence):
* How accurate did the captions feel?
* How quickly did captions appear?
* Was it clear when the app could not see your hands?
* Was the reverse (text to sign) animation understandable?
