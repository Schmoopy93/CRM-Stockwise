import * as XLSX from "xlsx";
import { AppLocale, Product, ProductCustomField, ProductVariant } from "./types";
import { getLocalizedOptionValue } from "./product-field-options";
import { INTL_LOCALES } from "./i18n-context";

const EXPORT_LOGO_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAACXBIWXMAAAsSAAALEgHS3X78AAAgAElEQVR4nOV9B5QUVRZ2w4ROlbu6e3LOeaYDGYYMKoowMIko4IoRAzIDTCSbVhEkmIkShiBMZCS77irJNYNhVzIKiIjApPrPfa+qurqnu2dw3X//c37OO3OaDtVd97v53veuSujoX0tLS1tbG358+cqV6ura8vL5OTn56el2kymUIHi93vD/7SIIA88Hp6RkjRyZU1JS9v77u37++SdMq7a2tpaWlg7Jq/LyWiv6hzFoaNgzadLU0NAYPz9CperapYvaz4/S6bj/OQn0/+ul03H+/lSXLlqVqquvrz4kJKqwcOLu3dVNTU1KGt4xAK2trZjxa6prs7OHILr7qdU0QfA0baYo0//nvK93LJ4geIoy0rSZIIxqNaNS+fn66nr37r9r125BABp6EQW3AIiy8/33P4wdU+jjq+3aVUuS+Av+NKITnXwngdb/nsqdvi9gUBNJmnx8tD4+mpEjx548edJFk3sDoK1NaG0F6m/fvjMoOFKl8iNJE0UZ9XpvpCc6T9D/y+TQ/89+GEkaSdKkUvmbzCEbNm5SKhWPALS1tWGFtXDhcz4+WrWGpmmzeBuE680Q7f7+WRQh/jQq8IRXvlG+0zuH/eFF02athu7Sxb+kpBxT2AUDFVJS4lOY+kXFc1UqH5IwUqQRG3oS6YE74iaCAM1IOCsQdAWRKOgv7+aCBHzjn3Lz+OuAsgTvUY/BS+Lvkb/3z5UbJApGlarrEzOelonsRgLwC5WVC1UqX9nGEqSBIDn4iwDoFN2RUXJZEmXdvESI9y9iQxA8Cc+4sqSInHeTIFHTIbXKL0J44weScMD7271Hfqzgif9MRLBhUKl85swpccFABABb3ffe29y1q4YkjSJRCEx9jiAd3KFkVRdaiLfndilvzC0GhNvnJWbEIigR1EWqpJckjEVKSVfw/KVel0OIxcf4gvK93zkGJGns0kX9zrtrlX6RSgbk66+/CQgMU2toEmsevUx9kANXWks3rOSLTt0tidadvkS4kgYxL/46Z+ojGjlYAWTX649xS3e4ZfH3iLIiAiDftVv56wAYkjRqtQzPB/3zn5/JZAcAsFm4b2SOSuXvsLoK6iuVoySSiApKZoSvd7CzB46WqEz+UQD0sjqS8ZYkQCa6xB8dXND9q9Jl4VV8WVFDIpFCvNhp6jskRlo0ZVap/O+5Z6RDBWFZ2LKlStVFTVEmSVnL2p8jSQeVZW0gfwEitHTDf1ze+Q65HvGgwc1ymBDs9shKSQmb9CP1Elk7gwpSvPjjstArVLFkkJSrPQDtIieKMnXpotm0aQtWRCABLS0tffr079pVS5Em6a4k2yv+XM8m909aegWDOwiK6O4wsHekdpF6lBS3AoM/9NsU8i0ZJL3yJe8/w1URde2q69G9D85VAAC7d1X7+OrA9uJfKasgLAeeHYA/j7sNnbJjDu9QtAEIFcmJ9OyltPffOvxVJFrOGEhAuvWU7mQBBj7aHTt2igCMHz9JpfKjKcT+Er8rNaAnWrh3bLw6PKTzryc6vgderzeiZdLrTYTerEeLgBVA6ANI9Bf9F94gLdGR9fz7O/qd7YVA/IhsDxwuryeYPS2KMqlUfuPGTQQALl68GBISpVHT8JVOulXp0nm4B7fU9xAKuEdI7/jdTtwtEt2IaB1AEngFohXgaRGEmRD/4mVCqODruN6ISyTvhf0dv1mKHP/DMI0geI2aCQmJunDhomrnzvd9Qf8olI+oguAZFBN5uZDT7xaZzhvpFaC24yC9SHcTEF2koEx0aZFoif8NgkUGkfpAUh/k/E4MiXgRjIpCODyrOC9Mo2SsPxQKOH0Ryfv46rfv2KkqKSlXqboykOl0KFnFT/Hg+ToiIwyVJ/PlIu+KAELpTuh5rF6AUiSmVyBeIpWJIIoIJslgIDesEIpQLDKEJENIIhjeRgaRhPgYLQADXQpJhqjBTJ5kQnZtvVsIkXtkg+zip+BIRWRK9xjQtFml6jp7donq/vvHqlQamjK6pNuUnqXS31d630rfX0l0d1R2wKZ4wGOuR6Q3k2QASQYSpEh3igimSCAuRYbSVChNhdEkLAr+hqPH4bCoMPQSPKbQq2iF0mQoRYYCZgBGMCkhKusoPWHSE0bJjDslMLxkTZzvXUJL9Mid/NH2RsLJDJDGLirtPffcr8rItPv5USj9wDmpY5GIjm+ViCuxtuK/7QDwAL4CNqyaCYeWCHRwNyI6RYYxZBhNhdNUOAV/I2kqkqIiKCB0OElFkGQkSUXCAyoCnqci4RkygiIjaAoWBR9EmBGhWGgkmQiURA3B4CIQCuI6WQIcGENUJOlSpXZSyIRrysRDiKD2p5KSMlRmc5hWy8oOqPyyE33baXZvsa4U4nsGQMH1BCY9UF+ieyhwNxGOKAgLkTiSJKMQueEvRUXhxbAxNBuDnocn4VURFREbCmCLoAEVJB9ECJIJSTvpZfOA9JKSi9t7GYoYzdu9izKhuH0PfrZOx3GGYJVbSinCDREPtxh4Ir3D0rourOtNDq4nMC1AvyPSh1NArEgKeDmSECkOSyQ6HU1R0TQVwzJxDBPn62/28w9g0GOKioFFR1N0tPQpgIFAl0IXFGEgyVCHndAHgRcrGmpX2+AGA6LjJclNpwyyqgNj7cU3cOvw4J/oJtEPpAdGQ7cq+S3BFKI7VjgUibQKqSQ6IjcdQ1OwGDqWoWJZOt7AJmo1oRpN2LAhjw8fMkOjCddoQjk2kaXjGSoW3kbH0gAVfIqiEB5kFEFGEVhfYSQIpJoQDJJtwOYB6UaFxynmMDpBelce7RAAwjMAjlDLAwBunGUZGFdPGTM+ukMgPWb8EJJA2gZxPUlGEEQEcCtmc5HosQwVx+JFx7FMPMcmk0SMv19IWup9C8r27q8RDtQIC8o+SE+9z98/hCRiDGwyyyQgJOIZKg7wEGGIIQEJEAgsEzSsCIQBloZgApDAzhIOIFwI4pntnO7dDQBe4gaVF39WUZFQKBzpC1yoT7r/PsnPwToHMT5yHEVdT4laQiI9Ui80YmEgHx3P0AloJXJsMk0l+PmFhob2enz6O3Xbbx6qE+qrmuurmg/XCXXbbj4x/e2w0D5+vmEMlcgxKSyVzFBJDJ3A0nE0rFhYAEOMLBBINUVgrwkjQeiDEaNgh9UpaJBLRqQewqPOaIXO5K+8qyCpCCVbArf+mbdCFeJ9uB+gPqEPJsFzD6WocBJzPYldl2gStA2wPCJWPEMnMnQCTSfSdBLLpnBsikYTwbEp+Tnzt6y99GGD0LCjpa6quWF7a8P21rqq5j07Wj9sELasuZQ3ZgHHpmn8Iw1MCsemMnQSuhRcDV0wjqJi0QKBAKUkWgiAgcTSABhIGskNBrJOVoZKinKbkiydKKKpvEXVssuPSOlN2bmnPkok4IAW1A6mPugckopAXB9BUBLpgUPjaKAR0B0IxyRxbCrPpet1sTpdbP++01ct/eJgvfDBrra6rc0N21sw9aXVUlvV3Li77VC98PrSLwf2na7XxRO6OJ5LBxiYZIQEAoNKYKh4WoKBoGQMsEbCMAQR+iCISEg5alPwpRNHOtwNt1a6EwB4UUHOXm275aZAiGFDzxj1so8P9jYEqA86J4KgwL0hwMxGI9cllqKA62k6gaITaSaJYZIR6TMoMsnfPyotZdSC0sa9Na37aoWaqub6bc6k3+F4ULe9pWZb874aYV9N26KKvempozXqaJpMMhgyWC4FwZDMUsksUk0YABAFOloBAxIFMYKTAjdQRw4MXIsfEqc7AFDA4EoZdwB4QElBfXcepyNcbAcAryeMkAjDDg+ytyiaDUfUh0UiM0tRsTQVR4O1RNqGSWSZZJZJ4blMlknz948KDenz+PR3aqp+P9gg1O5oqd0m6hwn6ssLq6MdrTXbmmu3txyoF2q23Zzx6LrwsH5q/yiGSTfAZVMZJoWlk1k6iaYTKTqeEpWSrJFw8BFOUsAx4KRKwbOyAiOVd5SRszIYdtYNHso1CgnwXOT0xP7eGj2A9xH1IVeMfE0iBKmdSET9SOTLxwDpaaTrgR8TWQYsp4HNMHCZGk0sx2bk5SzY/O6Fww1C/c7Wmm1N9TKne6Z+/Q4AAK+a7c31O1sPNQib11zMH7MQLquNMxiyOAQDi5QSTQEMNB1PUXEUHSuKghjWRaBwATupcvZCgYFz7kiZHVIm6jsFgOeCl9wq4gqD+8uJhUPR6ooOD7A/mFyCjBBdTMT4SBcngU4Ark/m2DSey9Tr4/W6hP59H1758meH6oW9u9rqqprrt7fU7Wj1BAAmupL08qrdARqpcVfboTph5cufDez3KKFPIogEgIHNYJhUhk5h6RSGTgb7TMXTdCxFg4+EXLJIhoqgIVYIocBDDZRSF0YvFRGpOqQkVwd5U5W7oEm5HNljF9vi7lOQTEbUDyRlh8eJ+rLaSaApsLQsk8Iy6QZDFkWlqP2jUpLumz+3cV91275aoXabQ93XoyWTvl7Cwy3dXWHY3lK9pXlvtbBvd9v80g9Sk+5XqyMpKtlgsLJMBkenAgZUMoNEgQZRwOpIMss4lQQYiEkLAsI02RhI5tCpyOEcDXg1xV69IOdGNqUcyK0JSqj0ehPkdvQBlD6Y1APv02Q49nYgCKJjaDIWGI1KFKlPp7JMGkOlaNSx4aH9H/vL29VbbhwEp74FFIhCt+yRYXDH7Ph5bzBsa63e2lxT1XKgVti1+beHp74eFtxPo46n6XSWyUA/A8sBxgDCBXCQlBiIGSQoM+h1Dt9U2bRJtis+i66j1wpEJwAQy6EKayy2/LkEXDjDA7xP6SXepxwRFrg6iPqI8ZNZOo1l0jgmLSSo99j7F2x69+zhPUjdVzXJhHZSO57pK5tfV2AUCqp+G8BQs7W5bnvrgTphw1unc0cvCg0ZwLKZCIN0pIuSGCoJSWccTcVis4ztAYocg+X8HcLADae65AIUIaqnorpXANr33ijr4C7Kh8TlFCe9j4J+Cjk8pIL6oHnTWBbcEp0ubtjAp/dVN3+0V6jZeqsWGVsl4WTt36Gq8bLqtyEAtmMMmnZvvf1ho9C4q2X4kGd12ljekMVyGSyTDuJIJ4NlpuLBNaIhtYczrIABEQpFIXAroNbmGhw4GUtn8+A1HPMuAS7+vlPKWkl9R6YB+/tEGOZ9iopC4iwqfZZO5iTqIzOYHhTYIySoT1zsPc/PP3CgRvhgl1CNnEi3qqaDtVOhkVwA295au621pqqlekvL3t3CoT3C4oq9UZEDTKZuQYG9WCYdXCMQhXROtMmJKGZGrhGSA6SLwhEGAAAFZdEAl+CAdDiNCvf9PwjERG/Hm9MpCgR2OiXDS4YC9bEzR0fTdByKPJHDg5Q+y2awTIbBYCHJ1NTknA1vn84bvZChrX16Tl+19OShPULjbvDl63a0uNJ3p2fSK14CABDL1zuo31K9tblhR+v+amH10lP9+z1EUmm9es98+qkT8XE5FJViMFg5Flwjlk7n6DSGAc8YxYaiX4SSdxFQ3qFCGTqM0AdotTzoIidjwDv1Q7b3btx5RJ6zoYqGS7kwoGiTUpRWxGQDTi+H0FQ49vdRoItCXAqpHfC+01k2nWUzOC6LN9hpMjMtaeyeXbc+bBSW//WLbtbJDGPLH/vc+1uvHm4U6lB2AfQGpq9bANq9VK8EAOmc6qrm2u2th/YI29ZfHXP/fIpMjo3Ne+zxD1/46++V8y/GxeYwVAbP2TkOAEArnWVTWIQBgxJ5WBfRTAxFRajVJlUXHUkEhoWkkGQQSlQ4KOZUEZP73b2GAh2kIhyvugiBnCCS2R8FXM6GN4YC5zqRBmcfUz+DZTM5LsvA2YyG7jRlTUvJ3b31RnVVa+Putg+q2xaUNyYkjgoNGzjj4Q01W5v2Vws1VeARdaB5djr0TC0ytvhBTRV4Pvtrhfqdzc88sSkspH9w8JD8/I3z512ZN+9qacX58sozCQmFLG0xct0MnAVhkMlhe8CigJlNMrBJFBXrrwnu4sPTdKQlY/hfxs/f/sbJpx58SaXSUFQQKiwrSO9qEjpSQR201ckeriIJpVg43yBWVyBsQVk2koyS/X1sdRnweTJYNovjLAbWzrPdjHxPmralJedWb7lVv0PAOgc5QrcemvqWke+REDtyYenBA7XC3hp4tXZHi5LNXTQPYvY2THdR3W9t/mB3275qYUnFodTEURzTa8SIZfPnn1+86FpZ6dmy0rPlFRfLys8mxo9jaLuR78mzNgNnBeZgswycheezWCZFq43x8Q0iyeiMlOGPTn5x06oTJxqbTx1u/dffhDEjHkO9zFgI5A0QLiWsjlumO3BDZXvgpH9cbS/K9iC/E1E/EqX148DnoZIR9dMZoH4mx1kx9XlDDyPfi6Gs6cm51Vtv1e8U6na21G8HN7F2e+vBOmHjWxfuvWsuy3QbmP30O6u/P9wg7HkfOLoORcVuFlI7mPd3b22CJES98Oby7wb0fVSvS7LbnppV9M2S525UVl4sLztbUX4erYslpWeT4sYZmO4mYx+e72Hku5mM3Tg2S69P9PePMbCZ3S15T0xdumHZ8SPVzacOC18dFI43CEdrW080tPSyjfDxoSgqkGjnEckmQdnUTHiJhD2qoA4gcTj+ONMp5fejaTIW8mtAfezvZ7BMJseIvM8bevBcLzPfm2Ps6Sn5GIBa2WBub6mpat7zftvBemH1sq969njIYOhVmPvitvVXDtUL9SjX5uLsywAAfttaDtYL2zdeHZf7AsfY42JzH56+f/Gi65XzLpeWny0rv1Ahrcryi6WlZxPjC3m2u9nY12DoSZIWjX8Sx2TZ0sc+MeW1zau+ONHY+u3fhK/2CycahCO1rUfrWo/Vtf2zQfj7rl/Cg9O1WjPKmLqWbuQsjvRkB27oHwPA2fYSUNFF7B9NQbgbxyCnE2UfIdrk2CwDazOw3Y2GHryhp5HrDffM9EhPKayuQhKAfB7Z9ayVEsv7a4WKOQ2R4cOCzH2ffGRjw46mA/VC7faWWskwYIe1dmtzzdaW/TVC/fbmZx57LywkOzBg6PhxVQsXXl244JfysnNl5efLKpTUP1dZcaGs9ExC/DgD2z3A1Dc4YEAP66Sn/7J647LPjuxuOXlI+PKAcGKPcKSu9Wh96/EG4P3jDcKxutYv9wqbVp5g6QipkInz1e5bHzukpEcV1BH741w/ru4GQ7JTzKdHo5grAfmdkOcBswYeno1n7UauO2/oyXO9TIY+AcZ+HNM7PWVCDVZBLk4nWjVVzbUof1C95caDk1YZOHty4piXlvz90B5hb00bvLqtBWoAVc17d7cdbBBeWPD35IR7KTJ92LAXyyvOLlp8vaz8fGnZufKKC3hJAJyvLD83r+JCWdnphIQJBq4Xx/YombHp5AHh5MHWr/YJJ2qFIzWY7m0y6fE6Wtty6pCwsHiT2t/IUOGoihkILTbtYuNOLvcS0NE2QbHUhdg/CIXpuE0KbC8CANgf0o2Y9zkrD8oHqG/kepoMwP4BpgEc2zcjdaIoAZ6Ve/VWMA9gGN45O/LeMoaxD8p+4s3Xvj9YL+zZ1brn/dZDdcLbK38YMvAJisy0d3ty5szPFy++UVZxqaTsXFnFhbLKC2UVF8orL1QoJKACJOB8adnpxIRJRkM/E58dG3nvqkUffdEofLK7+Xi9K93ldaS25dsPhQfHzVepSI6JAgBwvtq5aKOgpKNf9k4kQNmm6GrHgf1RtQtVGaGvBGfcIpHfCWVFVFBMZiDmyuTAvbMh6vfgDb1MPFDfbMwOMA3i2ezM1MnVSgnwEG3VVLXs3trcWN12+APhtb+eyEorIPXphWNf2LX5192br08seImh06KjR09/5MCS536rnH+5tOwskB5THy8nCQAAKirOl5aeTk6aYjQMDDQPN7B9ebbnolm7Tx4URAD2oOUMwLGGts8+EIYOmNTF18DQUU6JUuh1dEdJb1VbD3GAXOhxF0FI7A+dySEk6ufBjj8pOv4y9YH9OdZiwIaX78kj3jcbs83GAYHmoQYuOzNtcs3Wm9gL6iDQ3d5as72lenvLvhqhcWdryaxd0VHDI8OHREUMMgf2zy9YV7ng8ryFv5SUnSstP+dCercAlFdcmFt6JilpqskwMMg0PNA8xGToyzE9Z05fc6zePfsfa2g70Sh8Unc7Ib6fvyYIWiXFrhYQAgSAt/JipwIxN9GzG/OL3X8AgEbKB7IlyPWE6BGVFUWvn7UYOBsPqh9sr4nvYzb2Mxv7m42DgszDeMOArLQHaiQjXL9TTCzXus1rSukd8IK2tXzYKNRsv1GY+1K/7MqyyjNLnr9RVn6hBJPehfcxBjIA2B6AGwoAJCdNNcKPGR5gGhISOIwiuqUnjf1o1++fNgK5nQDYIxyrb/t8n1D/3mkDn6TTQ1cH6qWAtiIEgKNcc0c24I4+APVeVHHEoS9of6mbKgaVGJPEdBvS/hzW/oYeBkNPo6GX2djHbOxvMg4MNA4NDrjLaBhsSZtWu+1mw06hflsLJA+qpLQlTidIiX6cXVDiUVvV1LCjrW5n2+Ilv5ZX/lSK1b2S+uLji2g52L8cnjwvAlByOiVpmtk4MChgeEjA3QZuQHzM/dVr/vXFfkH0fOqF43XoL5KJI7UtXx0QVizZqyegcQ95fRGoiwJKZnpIDbUzxcSfDQBif9EA4KwninujKegrSYCeA8i4ZXBMpgGUD2b/nqL25/vB3ZqGBfBDTIb+Zv6ublmP1u64XbetRc4f1LVbYmJHAQBgUNVaX9Xy/qbblfPOlSIX0926WFZxqbz8IuZ6/Le04gK4pGXnSsvOlpaeSUt+KNA0NCToHhM/KCTork2rPjt5GEItTP0TdcKx2jaIvOoAiU+qm789LBQ98nqXriaGiZMaKUQAPPmjHQNA3DEAAWKpHZoJAQDUzhYHWQcK2J8DAMDxh7CLw7a3j5nvF8BnB5gG80x2kPnuu+9aPWjg0uS48dXbbu6tFnZvbq7e0lxbJcIgLwmAtvrtbQ51hPHY1rp7S/O8eRdLy91S/4JIfYnxMe+Xlp8vLT03t+TsfIgPfkyOnxYSOCI48B4Dm7103r5Th4HNjzdA5HWiAaj/z8a2L/cJR2taj9fB36/3C/kji7t0NbNsPOqtgzZThy/kLir+4wC4bbBF7B8EZS8x+MIll1gKmgDFYguivqz9QfmY+D4BxgEmQ3+O6WPJfGb69H/Mm3996rSD4aG51owHF1d8snc3dFzt3tJUW+WQBhmDBgDANdsMAGwGAMpExeK0yisulpdfQutiufyG8nMlkAX6ubLyygOT6jPTHgsJHBEadB/HDCp/quqbgyL1sc45Wtv6eaPQ+N65bW98ffKAcKSm5Xg9QNLTmuuvDmWYOFy+R32+0E9HooDAjRb681SQmPrH7Q5oswr2PnHaORHrH4bOMGAAWDvP9QDqG3oH8P1MXHZkWE5h4fai4vNz5v5UNPvH0rKLTzzxmdU6x8gNvfeueevfOn2oAZINu7c2uRMCsdIiU78eAVBZ6UkCLpaVXyorR38rLpWixENFxcUlS64/OeO4JeMJk2GAmR8cHjySowfPmPbWScT7x+rbjtULx+qEo7VtJxqETz9oGth7utHQbe3SI999KBytFg5uvRYe0kuvB39Pqt1DwRIDQHqIBv40APA2LgkAaPVBVZcYmopnxaQ/mF+UULTJSTezoU+gsT9L9bLaHl/1VvP8RT89W/RjUfHZ4uIzs2efLyn7+aGHDqemPhoWfPfUSSu3b7h2AFoioIzuCoDSHlS11lW17N7UXDnvgjsALoqkh78XS8rgPQsW/Tq35N/Dh71k5AakpU6322aGBo+gyP75I5d8eUA4Vtd2tK4NAKhrO1YL//1ir5A3skKvzWApm5Hv/mJZzQ9/Ezav+ifLpFJUAjR1UTHinhzUvYKr9miTwR2YAW/Nue4MgNjsRkFnOTRaIf8H2joZBAAHAEDuwWCw4sSD0dArgO8TaBrA0X0tWY8tW/37yjebXnjl+tzSC7Nmni6edXr27DMV5ZcrKn/KzdsaFDQiJvKeoqffb3gf/P3qrS01W0EjiU4RFgL0AGPz/ubmSmwDHG6Pk/9TipT+vAXXKip/GjNmTXDg0KDAuyc9UD1xUk1I0D0U2XtQ75mfVN88ATmGtmN1wPvH6kDbfH1QeGzyCo061WTsY+b7sLRFo0l4vnTXK/N3q9WRHJNM0QkkFYu6rHFHKW6jQyX7OxECrwC0D8GkbS2QfsBtbrCBAqJfaAenUxhodMg0cGAAjNj8gv7pG2AcxDH9rLYnlr1+c/nq28tXNy1ddWvR81dKSs7PLjo7p/jMnNlny8ovP1v0/eDBLxoMfayZE15e8smBOjAM0FEChWJEdFTkkoxECwAw/yI4Ngp/H6/SivMl5efmzb+6cPGv0x5sjIsZyzH27H4L5pRceOyJT0KD7qXIvvaMaQe2Xv7nHuFIjYP6n9S0fnNIqJxZRRI2k6EPz/UyQg7RTtNQJ0iKG0qSSQyTQlEAAG4qRZkYHA0EEvo7c0Y76I52fsbR7gn7uQAAcEDRphTZAU1H7r+F57oZkfdpBgAg8WBg+tptTy17/dayVbdfXXF72crbr73e9MqKm/MX/Ty7+GzxrDNFxT/Onnu+ouLaY48fz7LMYNnu9wwrXvvmjwfqhLrt4PBAdQy5SdDcgAHY0lw5H3mWzquk7GxF5aVFS3576ulPrdZHKCrDZn3yscePVM67Of3h42EhI1iqT2Jsfu2Gf3+5H/JuCuq3fHNIWPXchxzb38T3Mxn68mwvnusO9sxgY9lMPQEZRtQ8kUBRoh0mZQD0QW6iAc81Ga99QW4+hh1QUQJQ5d0RAMsGgGMzkQHA+qeP2dDXLALQz2Z7ctmq28tWNS1beVtcq5uWv9H00qs3yuf9VFR8pqj4dFHR6ZI5lyoqr057cF9sbCHPdxuf/9ftG349WAflSeQmyfYZSYCzGwp5iPILC1RHQwMAACAASURBVBf/VlLy7yFDFrBMZkz0/ZMmN5SBlrsyc+bXcbEFNGkNDhy28bVPT36I3J56ifrVkArdvOqrsJD7DNzAQNMgI9fXyPVGGdxuHNTLLCybxdLQTAa9vVQctJOKdhhLQJBUHuiU/sEAdP5YOzkFHYwazWHnIm6zlbL/YACwBTYiCTByfQIgAsgORO4/BmC5DMCq26+itfz128teb3r+r9dLyy7MmnW6uOh08ewz5eVXSkov3DfyLZ7vHRUxYO6snY27W/dVC0gUkH3ejgCQvCAgfdm5hQuvzV9weezYt80mq9FoHz3q7dKyn0pKfy6afWb2nNNZGY+wlJ1jer1cvge7/CeQ04k1z2eNQsOGc8nxBSzTP9A01MwPMBv6GbneRhEAG8dmsUwm6uJKRS1ccRTq50XhWBiSAAjH0J5LT3sUXY+X6LwRFgEQCwBg9yPlEEyOABAAFp6zm7AF5rAB6B9oGsIz/e22pxD1EQCrHABIMDS/uvL24uevzp17rqjo7Kzi00Wzz5SWX51V9P3AgYsY2mLJzHl5yT8O1AqNYBiaaiASbq4EhweoXzn/8qJFvz70lz3xcffRVFK/7LnPzPy2ouJacfHp4tmnS8ou9eg+i6EsNNmj9MlNpw5BZh8HXMfrwQZ82iD8bee1ntbpDNk3JGB4gGFwgHGgme9n5PogTuqOCkpZHJ2FWlcAAMkRUgCAs3Kdjoc7bk1UAgDsT0IRjgIA8H7SKAY2L8YjA4DKL0wmz1qMAEAPo6GnCQGAc58IgKexClLS/VV5rcQwNL382s3KhZeLis8WFYFSmjv30rzK6489eiw1dQpNJo8YPnPdG6f31wh1Va3vb75dCXmFS0uW/D5z5ud224OELiIjY8rjTxyvqPxt9uyLz876sXjOj2VllwcNfJ6lLTpt+kPjln5zUDhW2ypmeCDgajte3/bpB80jBs2hiL4hgXcHGocGGgaDBPDZJq6v0dDLyPUwsDaOtXA0lgDo36KoeNw1RJFRNBEhZeXwrmP+z48DIAlB4iJMME6CktD4Bikg1GWeCqyBJMDIQtcJz0PtJQDyPwOCTMN4doDd9vRyLwCsEmFYvqpp+eqmF5beKK/8qbjobPGsc0Wzzs6d+1NlxbUHpjSEhd/NsUmTC1+u2XZjb23b88//VjLnxyGD53F0QmTEkImT3i+r+GVuyc9FRWfmzDlbVPzjk09eGpC9wsDaddqM0XfN/vyDthPI2UfVLnB+jta2fXlAmJz3EqXrC2mJgBEAAD/EbBwQYMw2gQQAADxrNzAOFUTD9gLo5BUBgKycuJkA0qKdB6Dzp34QqPlZ2nAhJkHRZlKHCkIAWHkOVR8BgF4BkH8eGGQeamIHdrPPBAu8qllB8Sb3orASRGHZ6qbnXvp1bumFomfPFBWdnTP7XFnZL8VzLo4YscpgsMZH95/7bPWkiVsDA3pybNqIe5fPLblQBioLdM7cknPPzPz39AcvZvdey7M2rTYtu9fDR+p+/1R2+SHobTtS0/rVfmHG1Ddooq/ZMLCb9fnkxBkmQzbYAOPAAGM/kwGMsJHrYQQALFInbypNJ6MNNuCJgiqGaCCEwkb4zgDovAoSvSAUBuPjA6goWspCoyQEkgAOVBACAPIQSAIAACM70G6fCRRfjQBYLQOgwGC103+Xrby9fHXz0hW3Fj13ec7cs0WzzhbNOlNUdL6y8vrsOd/36T2X0McxTHL2gLmzir8rq/x1VvG5ouLTc+aeebbozNSp300oOH/XkLoAUx+9LiktcdSBqp8+/8DZ5a+GAu+8mdsIvY1ne6QmPTu+4N9JCTNM/IAg47B2ANh4FgOQxmEAUA8veCKwwtFBLUgCSA/BsNvWxA5UkOJQGXQqlZmCPEQw7OChxTIAJQIA/T8ckwFdTQYbL6mgQL5fAAAwzMgOsIENaF4GANxSsvwypwciBthTWrri1tKVt95cL6x4q7m04lJx0bnZxeeKZ5+ZW3KxrPy3KVMOPPjQgXkLbswtAS92Tsm54tlnH3n4x4LcU3ljfhxx98HgwCEEkRoROmjn26e+3CccqZZc/nqg/snDwqrnDvFcH4bKigovGDXyq/zc04nxT4DRMg0zmxwA8Fx3I/jWFtTDm8YyoIIwAKh1Nwo4Eu0hUJxN1DH1vXpByvMoJRVEEGbxFBlnCcBGGMJgse8T2QBDTzPXO9CIAAAbkG2zPQUqCNgcCL0MKN6MlJIUFiAMlq1EGKyEtXTlrZVvCTl5Lz/8xK431gl/XXa9cv6l4uJzs2adnTXrbGnp5bmlPz876/TsuefmllyYMeP0hMIfxoz6tiD3dM6oE6EhdxFEvInv/u4rH39zACjuoH5N69cHhE0rPwsOGMCQlrCQkSPu/sfYUWfGjP42If4JEwQuw83GQQiAPhgAA2czIAlgRAkQAUC+OPROk6QUB3Q6Kd05AJxz0aIKglZhGQBUCWBwHiLDgFs/kRuKvCAwwoGmIUZugM36+NKVtyQbgKMBySsVAWhaKtId1suv3Xx7nTBxytt+PixBhOYVLn9rfcuKN5sWPX919tyLxWAVwLufU3L26WfOPDDpX2NHfz9m1Hf5Y/+dO+ZUdGQhScTp9Ukvlu0+dUhBfeTyf75XqF3/79jIYYQ+KdA8eMRd+wvzzo0ZdWr0/d/Gxjxk4gcGGIea+IFmY7ZRlIAeBs7OYRXESDYAAwBGGJLSiuLwf8kGoFoYPkoJmuVFAGLBBkAmLlkGgBcDsV4mDiLhQOPAQPNgkohPTb932eqmpeBu3lrmEhCsFLkek/7VlU0vL7u5+h3hoUe3k0S4Rh3o68Nr1Oa+fae/8MrPK98SXn7tt8UvXJ0z9/ysojMPPfjvvJwfxtz//djR3+eO+aEg73Ri/MMUFa/RJBQ98ubJgwrNUyt8Ut326R7hb+//Yk3P1ahjeTZrYPaWcQUXx44+NTbnu9GjvgsJHkKR8YGmoQHGwSa+r9HQG7wgFgMgekEMnUpTSWgDQYwDAGkbE9LVfz4Aci4It8KFoz0LYiTMQiScwtKpHOvIRUMRmO9n5vvynIWkwvz8NHHxfVa8+dub7wqvvnbz1RU3HYy/8jaie7NM/VeW33z9HWHm7MMME9m1C93dcu/I4Q/5+Bh8utIxMQNK53369gbh1ZW/L37x+riCH8aO+iE351+5OT+MGfVdQd75zPRSmoz394+ekrfwGyiktEJ6uVY4Cu1WkO4/Xn97SL+H/P1iWTqlZ7dl+WPPjRl1cmzOt4UFF8bmnAowW9VqDUVG8JwN4gA+m+dROogDL4hTAIB39CEbgOtiIgAoDuhsQlTVaWHBkTBkQ1Eghk+XkdxQKhEVI1NBAnAnFkpgsUw6TUdrtaxOy8AxMDo+JXXYM7P2rX5LWPF669LXfn91pSgKSt5/ZfnNVW8IFQu/DA6y+Halw4Iz6tZ/d/Kw8PDE57Qas68PYzYlTZu+aeVbwl+X/V6Y/11ezr9yR4PqL8y72M3+EkPF+fmGjxj8xOcfgL8vOp2I+kdrWr/YJ+TdV+znE8GQidbMxfljz44e+fXYnNMFeeeHDt4WGjJIp+MIPa/TMTodx9LxyK+DwipEwoyFhUAsjaVTaApyQZS8vRuXBCAj7aZV9M9RQXI3LrLDYjccaoZArXBSOd4AyTgrx1jCw0YZTVYfX5VOx5AknMNDEkZ/X51GTfXo9UDZ/K/feFdYvrr5ldd+x6QX12u3XntdeO6v56Ki+/r6sEY+ft2rf/9qr/DJ7qavDwqvLqgNDkzt2oXUqvm7R5QuX3190vgzOSNPjbn/1Lj8S9n91rFUnL9vcC9r/sfVv33a4HA6j4Lyafn6gPD4Ay/7+0XSRExq8pP5uT+OHfN9ft6Fu4btj40u1Ok4jYaQ2vFNej3jr/bjDBkB5sEGxgr965CJQ7sqKQxALAIA12Twru5A8r8GAKggPcqGUsgOQ0McFUHRUJBBu65RNgKFAjxnZ8ik5NRncgrPpWfNoegQtVpLEkbYYYs6Z7p29aXZkPtzFr28/Moba4SlK5teee0W/F1xe9nqlqUrr6emj/TpqiP0QcvmV586LHxS03y0ru2TGnAcd71zypoxvGtXSuNvSE8fNfK+j/Jyzufnnh88aCfPpWnVwclxg/dvufB5o5hnPoqo//Hulm8OCuVPr9H4hxLakJjocfl5P4wruJQz6vPMjGKSDPLz94czbcHOwewErZYgyeDw8Dyr5Z3w0EKWTjNyMgCQh4CTLdBOSpKMQNvHRAt8p3X5zkXCjvM38HmcGABx+zU60QrbYQQAm2kwWBkqKSl5RsEDNwum3L5v7LGE5Ae0Gkqt1og7N0mTTs/6+KgjIu1T/7Jh2SrwNV9+7eYrK2+veKuld5+pfr6Unx83d8aqUx8Kn9Q2Q86gAdzHj2uav9gnHKn/reD+Z/z8DL4+BM+lDR2yc+S9f+P5LI3aHBpk2/n211/uh9yyyPt1QP2TkOVvJPWRWo0xOHDAmFEnC/PP9O29wmSy+KnVOh2Dzysj9EB6nZ4NChqelrHU3m2LzbYhNCQXORdWA4vyEEwK5CHQjmJckGFQGCy1Z7mervKfSYDzAZ9OBRm8G0luycKOEGrJ4jkLAJD6VP7k67kTfip44EbBlBsDhr0fHJLt5+en1RIE1kikWaOmfHzUiclDn519+I01wqp3hUFDZ/r76Xx86b9MqPzmEHTlH8Ntmqgz8HhDG+SQG1u/OiiUzHiLIoN9fUkDl2g2d9NpA2gy8u2XDkN5HXcwoPXx7pYv9wtbXj8RYEpW+7MB5h4jRxwbMnBnSEi2WktodBScSYOkU6ejNFqdgc9KTCqz2Tdbbe9lWdZYrOtCQ8ZybDqkQsEHTZMAgFM+RAMAEoCiMLivdhLg/ayIDiTABQBIB+GuUCgJiOfqwVbIWAb2AIs5UZ6z0FRiUsqTBQ/cyJtwNXfC5dwJPxdOuZU78efufZYaTWlqjUav59DJtjCtw9dPrdWxw+5+dsTIcrW/XqXyHTnswS/3C8fq0Z4IYH9poQTO0bpWUOj7hXXL/pEQ10PVVafXmzQa8wulW+XGHhAaFHB91ijUb/hXVITF358JMFkH9l+TlPSwWq33V6vRqS7QaanXc1qtjmaio2OmZ1nX2OybgPSWtRbLOqt1Y2jIWJZJNXBZDAMnTNCgfxLBBUK76VE5DOei0flCLkV516NSO90d7e7dPGpKhIy0AwCxLxHlRKV42MBZaBIBMPlG3vireRN+yZvwC8Aw8cq4qc1jx/8ryzaHooL8kdoFUaCgrdXXV6vRUKou/j2tdx+pvXFiDxAac/GxehAFqW1E7F34uBrKhwd3XBrUN1+l8pk5/ZXvPhKO1mHqC8fAAreeaBA+ev9qZkp2ly5qigyMCL/bZMrw8/dFTcsmZJN4rVZPkIFh4fmZWatt9i1ZlrVZlncx9S2W9Vbre6EheSyTioIA5IBCHhTqkcgC41MA4Xwh1BznzgJ73SZ2p62JRj1IGQbAYQYUWgi2o3JsFk0kJCU7ASDB8HP+pGsTpjXdPfKjyKjRGg2p1ejxCQgME+TrRybGdT9QdeGzRuFIXYvYogNZM2hP++qA3LqDF2LwPcIn1ddfmbfrWN0tqK5I1Mc9Jp82Ng/ulwdjiVCCTKejtTqKJANQh6tRqyO0WjIgoH9q2kt2e5XFuj7L8g4i/VoFABtDg3NRiJPFMGlQjsdJCOlcFXSwDT72D5fDxCxQJwl75wCIZ2qjeJjAJ6GgI4CgMyUBbQpL5ZhMmohPTJ4BAExwAgCtq2PHX86fdCN/8m+D7toWEjaQII0UZVar6ZCghN1rvvpqHzKhUqn24+rWbw4IK5c0rHn1w28PQ4OmKBliC0nb8frWk4dB5+AW2mP12PNp/eqAUDj6KZXKl6ZgLotejyYiILWj17NaLWEwpCckFNts71lt7ymI7gpASPBYxFiZKOMLDqikf6Jk/YOWU09KZwG4E+rLSWkz7IzU43AMtBBFSzkJlBblmCyKiEtMfqIdANfQ+iUfHl/JnfjThAeFe0cfYZlwtZqkqYC1r3548hA4nUjJIOrvbvlqv7Bp1VGWDSIJvnLm2m8OCsf3tIBxRm84Dn/boL5YDwBgYMBhPSjMmPacqos/CbwvqwJMei1Nx0RHP2qxrrfZtliysLpfj5cVlowBqKCQ4DGo4p0J+S5K7IeA40hB/Yod6oQiBm53IP+fCoCYkkNnf2JnVNqchIUAAcBmIAAeL5jkVgKQLhp/pWDy9bxJ58PCh6n9tX5+xIvIhH5SjaiP6PjxbujObNj4Q0RYqr8/pdexPj6aiXmzjjXc/KwRXsUAIAwc6+NqcDoXFq3z9dWKp71g1iEMWtD3fGjYqMzMVXb7Notlg2Rs13sAAIxwSHAObPYHC5zCAPuLpWAIg6STR9FWdUcxUjkI4M8FAGeExKM5UEiMDiYQO0Tl8mQaqY8BANrZAFkL5U78pXDKb4nJkzVqbVdfbdGjy04elHgfsf+RmtZPG4TD269kJPft6qOmKBglSpEmVRc/e+aQ3e9+BxnmGkc3p5zl/+agsGJxvU7H6rQcieI+gjBqtaRWR5sDslNSFtu6bbbY38tS6BlMd4tlgxXWevSkqIusto3BAECidJZKApy4iLpRcAiGmiHwLiVFBIDP/u7MsZUdvEN2oRRmQDr8GUwxiVvksCmGAn0cA6e/pZL6qISkxzwAcDV3wtXCqbdS0mdoNfquXbUPji+BzuSaVtm6Is0unGhs6t9rtErlQ2Eljk6noChT167+gebo5Qtrv/1QOFbXIpvrj6uhpbDqjRO8IVStpkgSYlqdjtZo9ByXlpAw22rfZLNtysp612JdZ7FtgIUZ37rBat1gsa5XLAkDAGA0TSWwTBquA6PDLpHilTMQ6ABq0f9RHF+Pz1ZyJeYdAODRfxIBICABC6dzSIfT4DbFRIZJIYiIhORH3Rjhib/kTrgyflqzrcdirUanUvmNHD71iwNQp0V+C7KrtVCq/fqQUJjzpDhcCx/0L/0YsNgaWq2mHpm86NM9zZ82gnf0SU3rP/cIjZt+jI3O8vXVU1SAXs9ptBqSCo2MesBifcfWbRtQFrO8dT0CAEgvLoRHlg0R3bpOeudaUEFBo+AQZRqasdDZHeggJzEDivQPdkDxJr12hSzvxPwDAHCOXdpiahqatOQaPVgCJonQhyckP+IKAFD/5/HTWvoNXKvXsSqVTw/r3Z9U/447c7AOgazZbsiaPTp5IZpjzOv0nFqjJWDCgSPCRAMPDCqVz4A+Yw7tvPT1QbAEh7dfTU/u19VHQ1EBWh2hJ/jgkHszMpfb7FsR0ddZ7BtFxrfjtV7CQEZinbQwAGus1g3BwaMoMgblf8D7pKR+UNSTi8uQ+ExFdGqHd13y50gAMKNyo1IoKpDhtAQcds4wiQBAkjMAQP3L46Y2DxvRyDARXX20iXE99m2+8M8GcOfFrFmdnDV728dHp/b3j0koGJFzKDpujEaj12j0SKtIfh7BU7S5S1d1bEzWmqUffbFXQC6/D0EwWi1pMvdJTl1s777Nat+UlbUWNLvE5iL1bRusoGewGcCWALO/tLANsG4IChpJkTHonFGs/eV9GfLJ66gM6XYvqjIS/pOMsNPhoNJh3OKRuGJQxiTodWFJyTPGTWnKHXcZMJj4S+74y4VTbo4YfcTEp/n5EeGhadVrT36xF1Ff3BOBsmYHhRVLGnQ6g6+fX2Bwr5xxpyf8pXXc1Ov9h7xnDuzu748SZ6S0I5cAdeTjozEaQvt0H+nnp9NpCYaJj4t/GtS9fYuoajB3252ob7Gut1rWKT1O5yAArax3bbbNSAKiaCZBPlARvE8Cm188fsDLeR0d2OE/DAA+IxH8Uek0dDEoI8ESxJNEZGjYiPvHfjN+akvexGtjx/1c8MDv9+d9FxjQU6OmDIbojSs/OulcqsUuf9Ub/zSbYvz8NAZjyn1jPyuYcnPshJ/yJl4ZP7U5d/xFe88XGDYKchgwPEh08CnSrNUyXbp0YeiIqKhpWdZ37N22yuoe3EqZ96UFz7hQ3LrOal0r4wGG2rLObt+SkbHCZOqHDl6Ll7Q/rgA79ua5bYVz7LX+7wCA3SGYQYLjQLRjIBw5Z7hlGjAwGOz2nkvHjr8wflprweSfo6LG6NScVmt+uWLnt4eFI9Wi9wKGtxqSCns2/hgX3c3PT89xMXfdf3jc1Nu543/C4VvuuCv5E38dP7Xl/rwvU9Ie0+l5tVoLYa3eqNUSej0fGnJvRsZye/edFjGsVbiVGADM+Egg8PPW9iwPa40la63NtsmS9VZ01KMca8WH/OLsPyEdHodL8Hh4GZqO4DSYTHHEtJcjhhEA/8H4asfR9FK/IgTG+Lwg5JLGU2SMThsSEnrP4OHVqalPUvowtV9w0SMroVRb3SLHUEdq2k7UCX/b8as17S5fH4phwgfd9f74aS2546/kTfg1b8Kv+bCugf8K4dvvE6Y1DR3RGB5xt7+/RqMljKYeycnz7N2qbPbNyL9cj+iLNY/oZTrYHz/jVuFAULbGZn3PZtuYGF9qMvYjiSiR+kj5oB4sfJyuYu4GYv/2MZfbCfDuAPiPZqmjYwsgPSe3LErZIQkDlkmiiGiaiDWwSWq/sOkTF399EG3EVfTGHqtv+3RPy9DsKV19GJII7JX9xgQF9R1r4jXsxeaOvzxuyq2Cyb/26LM8Nu5xu32T3b5VJL1tg3LJAFhFum/wRP2srDUoM7EpNeXF4KBR0PxMxTMMOlkaH90Hko2GM+HiF4S+Tj1Y7YVA/98HwACmGAMAG1dD0Kll4QSEx/jIREgQ0VSCgUvx8wvNGfHU1x8KJ/YAxfFu0GPg+bR+c1iYlFvu5weTjTJsleOm3c6d0I76AADCQMxkXM6beK1g0o0evXZbreuBvraNFttGq3Uj0F25cGCFTbEj5aBweCxrrJZ1NtvmjIwVEWGTWDqDIeMZqLogvxMdIIp6TxD1YdaGnHpzaoQWp4rc4ZC9zrUmeh6mJ+9dxcdWIiHA28fEaiVFxXJsoo9vUO9uecfqb376AZRZoMKFs2bVrd8cFGY9ulqrjqHJqOT0Zwqm3MidBD4rIjdaIunxYxEAyOhNvJZTcN7WbZPI7Lb3rNb3LNaNDl3v8HkwAI6ED0JF0jlgM9bExjzFcz0pEkSWZZJRzQtthYSjQ6PEUWVi3k2Z+lfmHtrPHHZHTBcAOqC+WwBcD1LB1jjQcYANJZ3eR0WxXIK/OiQpduC+zRc/axRPAYACL+qN/XqfsHDWNr0+kSSi45OmFU79JX/ytfyJV/MnXsuf+Gu+yO/X8iddQ8/Ak0oAxhResnXfalVoHlfSK5xOZ+qvy7Kusdo22mwbkxIrA8zDGCqFoVNZNpVmktAciQQYLQDUj3EMFYCBcIqT1F2p3+5YGqdx43cEgPfwwc3lnPfvkaIxoKApKCw0xLbr3ZNf7Rc3ZGHbi7Nmq5YcYuhUiowPjxgzZvyPhVOu54nUh4XCN6z6r+VhPCQVJAIwDgMAbiUs2csEANYrqC8ZZLSyLOsQ6Tenpv41JDgH9nzhdD+bxoi8D4yPxFfy+mHoTSjaCCbvRXU6MVQxUAM/KU9ZcBoO9wcmaDhOwPdwfpP4fdIWPmSN0dxAhorU60NpJnrda3//9m+KUwBQpvPrg8KOt78KCepNEEkGLnPIXfsmPihAkQC0/zU3BkCsJbhKgL37FpH61g02tMAkiDIBmgfBs94Kbj42vOvt9i1ZmW9ERvyF42wMlcTRcIgypJoR9dF0EzwWTkp5ikVH2e90dvxdxlzc4bjnjgBQzEQmOuERwUZifSClD6Zh936I2t/4Yuk2oH69WKqFQ1+qWz/fI+zdei4xbohem8jDOf7pQYGDe/R+PW/ClXEPNOWOv5or5lBl0mNnFJd0lABcRABAqKVYmNwIBmSfcYrfal1rs79nta6Ni5tl4rMZOhkOFcGdbuLx9Yj6ouaJFs8BEA+kEbtOJMOrODXaZayv44CyTnk3HY+xUkwTU77kaYADDgsgPO7alZz50FJUX7x9tL71WH3rMehmaD5RJ3y041d75hg//3CjAR2ZzWQyVDJFxEZE5A65q2HcAzcLJ99EbuhVzPgoCBCraa4S0G0LjnXR2qgAQFoWiG/ttvfs9veSkxYEBtwNuh6dKMIymXiOBh6whA6LholjMGsMDdFATiduecM7IOW53TJTKsfWK+swjpPUOwjEvA44dhoDIY208g6saJD9/ZjHpy758Yjw2QdQT//6AKyv9rd9c1D4bE/LkH5TfXwCODYFKV9MjgwDa6FJaK1ITJ5x7+gT46c250+8jmCAEma+WwAKLtntmxUAKEkvMr7NtqGbfXNG+ithIbkMbPFFxUWR8aHLEzM+pj5KduJao3hkPT4PXrH/1OQYmyRP2cRL5zgr1Hmg2B85NbH9yHVxJITz29xckSTMfv50cnyvN148+M7SD9986dAbLxx+8/lDb75w+PXnD65bfqRgVLGPbwDHonleMMQH9zTC8cYcnO+aSRFxvKG7xf7cmIIfx09pwfXL9mU1UQI8AIDU/Qa7bXNW1htRkQ+Busd1XRpvcYGjoSXGRwPepFgXRfLA+w7NA9SXj6JxnusmksWFX9uN3PFuA9xHbp7Gtokm1zFsu/3kSJ2Op+kgHTwwok0jKG6EA3bD9PowtTYUtbHgaZFxaMYdTFlDhW/Ybs+hbUCEPiYocEjf7LX5E39BhuGKKwwTr+UUXrTJAIDhRYyPilnwvHVdfNwso7EvKiim491F2Ngi6mPSI8bHkybxjEkYf4uyPXjLkThVr13Dj/Np3d4o1jEAHqcoSWPJ3I1xhV+gfMn5xwH1nQ6XFkcLwFxmcdysOO0UDbVLYBg8PQ+fNop3O2XSZBJJxEZGFgy5+wOUe7gJAbCjwIAA6LZZsrfrLLZ14GJCMmdTcvKiwIC7KRhUlYImFqSJV4b4VtQ5A84NqAAACjlJREFU2N7iEbmopIqpH4aHSkvJTjMq9iqo70Gty7RyO2XcU0jbUTLOE6rybGkXTecUo4lNRNKIcjQqG4aTw3hsPH+ZwtM7IdyPpxiAgWaSaCaZBiTQ3mM2Hc5CphMTU2bcm/PZuCmyYYAaw5hxF+zdNkNmH5USrbaNdvvW9LSloaDuU4Hx2TRYiOuRn4MYXwqy8GAANNMPxnVLeR6IJRVHkGGfh4dSYPtzPJUBMGbH9tMMvY5dQ6kIrxi4maSHSO86VNsFAKVfJE7OFgc3A38BBrCzB+/0g6yRWE/GMw0TxXGSWDWxqSybQkBy25JlW5xTcHrclKa8CVfyJl7OKbxgs2+yQEy7rpt9a1bWm1GRD3JsFkXFsmwKYnkAErF8osLSIo2PR2PIjE+hmarw8xTT81xGPLcLqZxp7VYLeeVvSQV5d2ycLqSA1PUrPXxcHC5GkuJJK9KBf2HotsHika7SANOuEL1gkC2eqYqyY/F6XXhAwMDe2e/mT7pcOPXWqPyzVtsGu32rzbY+Lm4mb+iFirewYxAFtHjBkDZGnmgrjubBahAxPmzxhShXEeia26d63KsdaINwP+rRSfN4pq0IQEfDrJSzhWV3yDHYwfvpvGjBxgfAAE62U466CkMzJkVRwAfA4hmbeP8lJU63xSuJY1IoMprQR0RE5gwaXpc38Zdu3bcnJc0LMA8jiWiUQEaty3gqK5rpLE8SFqed0/KAdKRzxNE8IXhKlTTF1ssuF3zjbiXAEQk7Rr90PMChc5LiArsyRpPHynn9Jpg2I535FygeOkTgDl8EAzQ5wTR55IpgEy2Oj0dztWPRoRRoVjkTzzAJen0ISUQnpTwRET6O0kcTRCSaCCoqGUTxOORoiSkdWdugtBp8F6qrwBxnaXMLrq6Izr5bLlQO63EDAKgK2OKhUBWSlPwBFdTBfDGlWMhzO2SZ8AYDzDZHKSMRBmnOMFJKZDhaQCPFcHk8cxivGGQ5Y2gG8mU6XRBJhKEJ8ojc6CXM6ZKeESeZI9JHMmB7wmkylIavgyGRaHyzUu04JhW6u2vX2Ko977cvxHcUiDk7s50WApnxHWOznGTQ28exZUbCDgM4xBE04gQ47K0iJBC3wjxB7KGDjpIGEYuOLHgyOG8T1W6JREdmJpxGE6iwwNGQK8TtbJLOcZw/78xATrNT5WSDUmO7DnV3RagjaiAJIDmC4NwT2k2flyIU7Ezc4Ua8ODz/Si/DIA48DxQ9JSQT0HMnaieQCWSxcV4e220oNjhSZg5yg2HHwRQs0bdBHjDsaQgWSY8VDuniaLr+cmf14oaUTuMLRY3vZeKdJwkgDQTpBgAv1tUxxRg+284KgZ/qXKZwZihp8aJhcAiEGDRIm57lkax4Qb0ThRFYk4RjVNAKp9ACigPRMd0l3wb8ehxVYb2Hvwh3Uym8TCfqK8aBOUbJu1RKRG0jG17Hp8h2aHk5vt4xhq/dj1D6WDj94FzlcRMQ6EkDrE5FCQbpHgAGsbwMXAlGQkEvPCIO1dpAU+GgGpV9IKyT4cEMjgDD+h32sqElDyd3kN6131RJJifO81QKdEMrxV2L/qFzQcYtACZzmE7LkjB9zzGp20n9uY0sHD3A+P2KVx3BodF9RO7eWeKlJbW/yyPpJclACioIDAakldBjFDehpI0sMegNMsXJAIIMhOUIa5F37/bwGOfw1Y1z6JWUjgqKkms9O4c6HWfgg1WZmd38/UiKwsoELQ+zM5Tzi10uKhouF8wcY709Wwi9JzCwTOBZKXhnoAMMSYfIwGD6gm4hXV/FZ5cooioPpVasOWV1Kkp2exLLb+6EevE6rZxX+9OpqRZVbm4hTIRjTKJCF3MaYBXaD9dQCAHvaXKW0wNx+DBaeMSlhE0nYDAoxUK50AYFWVCQrKBCkOTFyxTHwZS8PF3chb2kULZzpFRgI8dojmt6Yn+KMqlUmtE5eapFi5aoVL4MYxKpL9pVabm4sXL6od2oUAV3t6slOAyUq7nWdwoGF5IpaScvo2IpJpx6vZrkI4qBqxc32rUw3k4mRAo4nCVxuKGnb6dpk0rlu2DBEtWHH/5Nq2Ml5YNzbdiOg2UG49yuxc4p7nAGQBEku1E78vMk7mEiXIei/6ddYi5U8zoawTWWVDB+O7YTiStnXzxcsB1jKUYZtv+IVsscOvShqrm5yW7v5euro2ijkwoiOKyF3LY8OjO4G2CcrVC7CqoHe0D8edS/syX5eJ0vprf75c6RsBwTuHszSRp9fPRWa/fbTbdVgiC8+upy2EzLmpR2WPyr4AIxIFRYV7cMrhgt2k6TOhmSThrk/yeX+8YcHAlLzqjnLBBNm1Uq3xdfelkQBADg6tVfkpIz/PwJikZRMbbASo/I2cfyHPq6CbicbIZrEttwByzfYWq3E8347t/f+U+57Xpzc1lvvEWSRj8/KiE+9fLlywBAS0uLIAhr160XfSGHKcYYeI7O5QKQE91lZ1+WRInWTkbYwyZC4s6J69Urd++2K5hDqSE7uGa7WtgfQxSxv/rdd9cKgtDS0gIS0NbWJghCYeFElcqHYQPwJbAEuEStDnZWGm2n+px7EXEO05Siw7u5N+e7ctiSP4CNm+cls+TJGfMCG0QJHeHtVYYYJkCl8s3LGw9kb20ThDYHAJcvX7Z366VS+WMMsBlwcrPk0pis351/vYeanCQuknA4mQ1CcUui6nTpPFBERp3REu2WGxde/EbnaLHDSzl2vHg4FdfzByXeD1CpNFlZ3S5duoTI3tqGARAEobW1VRCEb7/9NiEhrUsXNcsGOGyAkwSI/C7Gt059c+7jXoUvpMhdiybBoJw8LTW5uOFH7x69ZO7afdDJN3cC1QG//s6s0R2OXVPwPqJ+XFzKNydPYeXTBpwPAAD746cEQfjuu+/t9l4qlQ9NmynKaeef8twFOeSTvGOHopDzUFJNzsHXTslbJZn0sjS09wIxx3n0DhVVIMnOO553bu6TvsXl49gvUMDWoTTcmatKorNgVCofi6XHqVMi9UEA0HIAIMvBlctXJkx4oEsXtZ8fSdNmx2kj7vhOygI55a2c20llALwXywxuomuJSTt7ty7yquDxP8Cz/+EiEOlp2uznR6pU/oWFk3++/DMiMlBfEFrRX0kF4f9gxdSKTMKWzVuTkzJVKl9fHz223RQFRy8o3Hm5KuCNRrhSIfnFd3gPhMJ6d0T6dtkbOSslpqTc8Med09Ql8nfzBnSaBU1DGsrXF45fS0zI2LhxM7a1rW2tiPR4CS4AiM/C+wAl4dq1a6+tWNWtW2+tFo4VAJnwp3Q61rO347xV4Q8ug7creAhE/gtL4Wh09jdDhtnfj+rSRaNS+Wq1rN3ee/nyFdd+uYa1S1tbi8z4kuJxAIAxkB+1gZVAotDc3Pz3v/9j0aIlo0fnpaRYjHwI6aFZ0WWJ2Z47e4/RUyekuLy/1Ilf9cdXBz8MfBaeD05JyRo9Om/hwuc++ugfTc1NmKGxyVVqGonQbf8HLkeFJBE7C6QAAAAASUVORK5CYII=";

const exportLabels: Record<AppLocale, Record<string, string>> = {
  sr: { product: "Artikal", sku: "SKU", category: "Kategorija", variant: "Varijanta", variantSku: "SKU varijante", quantity: "Količina", min: "Min. stanje", status: "Status", low: "⚠ Nisko", ok: "U redu", none: "—", title: "Stanje artikala", date: "Datum", products: "Artikala", total: "Ukupno komada", extra: "Dodatno" },
  en: { product: "Product", sku: "SKU", category: "Category", variant: "Variant", variantSku: "Variant SKU", quantity: "Quantity", min: "Min. stock", status: "Status", low: "⚠ Low", ok: "OK", none: "—", title: "Product stock", date: "Date", products: "Products", total: "Total units", extra: "Extra" },
  ru: { product: "Товар", sku: "Артикул", category: "Категория", variant: "Вариант", variantSku: "Артикул варианта", quantity: "Количество", min: "Мин. остаток", status: "Статус", low: "⚠ Мало", ok: "В норме", none: "—", title: "Остатки товаров", date: "Дата", products: "Товаров", total: "Всего единиц", extra: "Дополнительно" },
  de: { product: "Artikel", sku: "SKU", category: "Kategorie", variant: "Variante", variantSku: "Varianten-SKU", quantity: "Menge", min: "Min. Bestand", status: "Status", low: "⚠ Niedrig", ok: "OK", none: "—", title: "Artikelbestand", date: "Datum", products: "Artikel", total: "Gesamtanzahl", extra: "Zusätzlich" },
  es: { product: "Producto", sku: "SKU", category: "Categoría", variant: "Variante", variantSku: "SKU de variante", quantity: "Cantidad", min: "Stock mín.", status: "Estado", low: "⚠ Bajo", ok: "OK", none: "—", title: "Stock de productos", date: "Fecha", products: "Productos", total: "Unidades totales", extra: "Adicional" },
  it: { product: "Prodotto", sku: "SKU", category: "Categoria", variant: "Variante", variantSku: "SKU variante", quantity: "Quantità", min: "Scorta min.", status: "Stato", low: "⚠ Basso", ok: "OK", none: "—", title: "Giacenza prodotti", date: "Data", products: "Prodotti", total: "Totale unità", extra: "Extra" },
};

function fieldLabel(field: ProductCustomField, locale: AppLocale) {
  return field.labels?.[locale] ?? field.label;
}

function localizedValue(product: Product, key: string, locale: AppLocale, fallback: string | number) {
  const field = product.customFieldDefinitions?.find((definition) => definition.key === key);
  const value = product.customFieldValues?.[key];
  if (value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? ({ sr: "Da", en: "Yes", ru: "Да", de: "Ja", es: "Sí", it: "Sì" } as const)[locale] : ({ sr: "Ne", en: "No", ru: "Нет", de: "Nein", es: "No", it: "No" } as const)[locale];
  if (field?.type === "select") return getLocalizedOptionValue(field, String(value), locale);
  return value;
}

export function exportToExcel(
  products: Product[],
  variantMap: Record<string, ProductVariant[]>,
  shopName = "Radnja",
  locale: AppLocale = "sr"
) {
  const labels = exportLabels[locale];
  const rows: Record<string, string | number>[] = [];

  function customValues(product: Product) {
    return Object.fromEntries((product.customFieldDefinitions ?? []).map((field) => {
      const value = localizedValue(product, field.key, locale, "");
      return [`${labels.extra}: ${fieldLabel(field, locale)}`, value];
    }));
  }

  for (const product of products) {
    const variants = variantMap[product.id] ?? [];
    if (variants.length === 0) {
      rows.push({
        [labels.product]: product.name,
        [labels.sku]: product.sku,
        [labels.category]: product.category,
        [labels.variant]: labels.none,
        [labels.variantSku]: labels.none,
        [labels.quantity]: product.totalQuantity,
        [labels.min]: product.minStock,
        [labels.status]: product.minStock > 0 && product.totalQuantity <= product.minStock ? labels.low : labels.ok,
        ...customValues(product),
      });
    } else {
      for (const v of variants) {
        rows.push({
          [labels.product]: product.name,
          [labels.sku]: product.sku,
          [labels.category]: product.category,
          [labels.variant]: v.label,
          [labels.variantSku]: v.sku,
          [labels.quantity]: v.quantity,
          [labels.min]: product.minStock,
          [labels.status]: product.minStock > 0 && product.totalQuantity <= product.minStock ? labels.low : labels.ok,
          ...customValues(product),
        });
      }
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 28 }, { wch: 14 }, { wch: 16 },
    { wch: 22 }, { wch: 14 }, { wch: 10 },
    { wch: 12 }, { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, labels.title);

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${shopName}-stanje-${date}.xlsx`);
}

export function exportToPrint(
  products: Product[],
  variantMap: Record<string, ProductVariant[]>,
  shopName = "Radnja",
  locale: AppLocale = "sr"
) {
  const labels = exportLabels[locale];
  const date = new Date().toLocaleDateString(INTL_LOCALES[locale]);
  const customDefinitions = Array.from(new Map(products.flatMap((product) =>
    (product.customFieldDefinitions ?? []).map((field) => [fieldLabel(field, locale).toLocaleLowerCase(), field] as const)
  )).values());
  const customValue = (product: Product, column: ProductCustomField) => {
    const columnLabel = fieldLabel(column, locale).toLocaleLowerCase();
    const field = (product.customFieldDefinitions ?? []).find((definition) => fieldLabel(definition, locale).toLocaleLowerCase() === columnLabel);
    return field ? localizedValue(product, field.key, locale, labels.none) : labels.none;
  };
  const escapeHtml = (value: unknown) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const rows = products
    .flatMap((p) => {
      const variants = variantMap[p.id] ?? [];
      if (variants.length === 0) {
        return [{ name: p.name, sku: p.sku, category: p.category, variant: labels.none, quantity: p.totalQuantity, minStock: p.minStock, product: p, custom: p.customFieldValues ?? {} }];
      }
      return variants.map((v) => ({
        name: p.name, sku: p.sku, category: p.category,
        variant: v.label, quantity: v.quantity, minStock: p.minStock, product: p, custom: p.customFieldValues ?? {},
      }));
    });

  const html = `
    <!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${escapeHtml(labels.title)} - ${escapeHtml(shopName)}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 2cm; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      .meta { color: #666; margin-bottom: 20px; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f0f0f0; text-align: left; padding: 6px 8px; border-bottom: 2px solid #ccc; font-size: 11px; text-transform: uppercase; }
      td { padding: 6px 8px; border-bottom: 1px solid #e8e8e8; }
      tr:hover td { background: #fafafa; }
      .low { color: #d97706; font-weight: bold; }
      @media print { body { margin: 1cm; } }
    </style>
    </head><body>
    <h1><img src="${EXPORT_LOGO_DATA_URI}" alt="" width="22" height="22" style="vertical-align:-5px;border-radius:5px" /> ${escapeHtml(shopName)} — ${escapeHtml(labels.title)}</h1>
    <div class="meta">${escapeHtml(labels.date)}: ${date} · ${escapeHtml(labels.products)}: ${products.length} · ${escapeHtml(labels.total)}: ${products.reduce((s, p) => s + p.totalQuantity, 0)}</div>
    <table>
      <thead><tr>
        <th>${escapeHtml(labels.product)}</th><th>${escapeHtml(labels.sku)}</th><th>${escapeHtml(labels.category)}</th>
        <th>${escapeHtml(labels.variant)}</th><th>${escapeHtml(labels.quantity)}</th><th>${escapeHtml(labels.min)}</th>
        ${customDefinitions.map((field) => `<th>${escapeHtml(field.labels?.[locale] ?? field.label)}</th>`).join("")}
      </tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${escapeHtml(r.name)}</td>
            <td style="color:#888">${escapeHtml(r.sku || "—")}</td>
            <td>${escapeHtml(r.category || "—")}</td>
            <td>${escapeHtml(r.variant)}</td>
            <td class="${r.minStock > 0 && r.product.totalQuantity <= r.minStock ? "low" : ""}">${r.quantity}</td>
            <td style="color:#aaa">${r.minStock || "—"}</td>
            ${customDefinitions.map((field) => `<td>${escapeHtml(customValue(r.product, field))}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
    <script>window.onload = () => { window.print(); window.close(); }</script>
    </body></html>
  `;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
