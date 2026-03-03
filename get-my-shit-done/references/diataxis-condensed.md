---
diataxis_primary: reference
diataxis_secondary: none
diataxis_rationale: "Agent looks up quadrant rules for generating documents"
---

# Diataxis Framework — Agent Quick Reference

Condensed reference for use in agent `<diataxis_style>` tags. Apply these
rules when generating or classifying documentation. Full reference with
rationale, examples, and decision tree: `references/diataxis.org`.

---

## Quick Reference Table

| Knowledge type  | Useful when studying | Useful when working |
|-----------------|----------------------|---------------------|
| **Practical**   | Tutorial             | How-to              |
| **Theoretical** | Explanation          | Reference           |

---

## Tutorial (learning-oriented)

**Definition:** A lesson that takes a reader through steps to complete a
project. Reader learns by doing. Author controls the path; reader has no
prior goal.

**Writing rules:**
- Start with a concrete action — reader does something real in the first steps
- Let the reader do things — every instruction prompts an action
- Provide a working result at each step — visible progress sustains motivation
- Explain only what is needed to proceed — defer theory to Explanation docs
- Set expectations up front — state what will be built and what is assumed

**Anti-patterns:**
- NOT "assumes reader already has a specific goal" — that is a how-to guide;
  instead, onboard from zero and let the teacher control the path
- NOT explaining why things work mid-tutorial — instead move rationale to an
  Explanation document and keep the tutorial moving

---

## How-to (task-oriented)

**Definition:** A guide that takes a reader through steps to solve a specific
problem. Reader has a goal and assumes their own competence.

**Writing rules:**
- State the goal immediately — reader needs to confirm this solves their problem
- Assume prior competence — skip onboarding and background
- Give numbered steps, not prose — narrative slows the reader down
- Keep steps minimal — include only what is needed to reach the goal
- Note edge cases briefly — "if X, do Y" not a paragraph on why X exists

**Anti-patterns:**
- NOT explaining concepts the reader already knows — instead remove background
  material and start at Step 1
- NOT mixing in tutorial-style scaffolding — instead strip any "for newcomers"
  content into a separate Tutorial document

---

## Reference (information-oriented)

**Definition:** Accurate, complete, and austere technical descriptions of
the system. Consulted, not read from start to finish.

**Writing rules:**
- Describe, do not instruct — "returns a string", not "you should use this to get a string"
- Be consistent — every entry at the same level must have the same structure
- Be complete — document every option; omissions are defects
- Be accurate above all else — verify against implementation, not memory
- Use an impersonal, machine-like tone — avoid "you", hedging, and asides

**Anti-patterns:**
- NOT adding "Background" or "Why this exists" sections — that is Explanation;
  instead link out to the Explanation document
- NOT including procedural steps ("first do X, then do Y") — instead describe
  the function/parameter declaratively and link to a how-to guide

---

## Explanation (understanding-oriented)

**Definition:** Discussion of a topic to broaden the reader's understanding.
Reader seeks comprehension, not task completion.

**Writing rules:**
- Discuss, do not direct — use declarative sentences, not imperatives
- Provide context and background — history, motivation, trade-offs, alternatives
- Connect concepts to each other — build mental models, not lists of facts
- Accept that the reader may not act — understanding is the success criterion
- Link to tutorials and how-to guides — "to put this into practice, see..."

**Anti-patterns:**
- NOT listing every option, parameter, or signature — that is Reference;
  instead keep only what illustrates the concept and move the catalogue to Reference
- NOT giving imperative steps ("to understand X, first run...") — instead
  describe, discuss, and link to a tutorial for hands-on practice

---

## Tutorial vs How-to disambiguation

The key test: **"Does the reader know what they want to achieve?"**

- **Yes** → write a **How-to** guide
- **No** → write a **Tutorial**

| Dimension        | Tutorial                        | How-to                       |
|------------------|---------------------------------|------------------------------|
| Reader's goal    | None yet — follows the teacher  | Specific — reader knows      |
| Competence       | None assumed                    | Competence assumed           |
| Path control     | Author controls                 | Reader controls              |

---

## Classification checklist

- Reader learning something new with no prior goal? → **Tutorial**
- Reader solving a specific problem they already know they have? → **How-to**
- Reader looking up an exact value, parameter, or behaviour? → **Reference**
- Reader seeking to understand why or how something works? → **Explanation**

When in doubt: can the reader articulate their goal before starting?
Yes = How-to or Reference. No = Tutorial or Explanation.
