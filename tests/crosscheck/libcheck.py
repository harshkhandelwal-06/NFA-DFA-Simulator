import json, os
from automata.fa.nfa import NFA
from automata.fa.dfa import DFA
data = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'out','random_dump.json')))
n = len(data); eq_lang = eq_dfa_size = eq_min_size = 0
def completed_size(d):
    """number of states if the (possibly partial) DFA were completed with one dead state"""
    syms = d.input_symbols
    missing = any(a not in d.transitions[q] for q in d.states for a in syms)
    return len(d.states) + (1 if missing else 0)
for d in data:
    nf, df, mn = d['nfa'], d['dfa'], d['min']
    trans = {q: {} for q in nf['states']}
    for q, row in nf['delta'].items():
        for sym, ts in row.items(): trans[q]['' if sym == 'ε' else sym] = set(ts)
    ref_nfa = NFA(states=set(nf['states']), input_symbols=set(nf['alphabet']), transitions=trans, initial_state=nf['start'], final_states=set(nf['accept']))
    ref_full = DFA.from_nfa(ref_nfa, minify=False)          # plain subset construction, no minimisation
    ref_min = DFA.from_nfa(ref_nfa, minify=True)             # library's minimal DFA
    mk = lambda x: DFA(states=set(x['states']), input_symbols=set(nf['alphabet']), transitions={s: dict(x['trans'][s]) for s in x['states']}, initial_state=x['start'], final_states=set(x['accept']))
    app_dfa, app_min = mk(df), mk(mn)
    eq_lang += (app_dfa == ref_full) and (app_min == ref_full)
    eq_dfa_size += len(app_dfa.states) == completed_size(ref_full)
    eq_min_size += len(app_min.states) == completed_size(ref_min)
print(json.dumps({'automata': n, 'both_machines_language_equivalent': eq_lang, 'dfa_size_equal_to_plain_subset_construction': eq_dfa_size, 'min_size_equal_to_library_minimal_completed': eq_min_size}))
