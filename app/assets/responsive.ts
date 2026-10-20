/**
 * Large artwork in two sizes plus a tiny blurred preview, so slow connections show something at
 * once and phones download the 880px version (about a quarter of the full size).
 */
import LastSupperFull from "./last-supper.webp";
import LastSupperSmall from "./last-supper-880.webp";
import MyCornerFull from "./my-corner.webp";
import MyCornerSmall from "./my-corner-880.webp";
import GospelTeachingFull from "./gospel-teaching.webp";
import GospelTeachingSmall from "./gospel-teaching-880.webp";
import DailyReadingsFull from "./daily-readings.webp";
import DailyReadingsSmall from "./daily-readings-880.webp";
import BibleQuestionsFull from "./bible-questions.webp";
import BibleQuestionsSmall from "./bible-questions-880.webp";
import PrayersFull from "./prayers.webp";
import PrayersSmall from "./prayers-880.webp";
import PsalmsFull from "./psalms.webp";
import PsalmsSmall from "./psalms-880.webp";
import SaintsLivesFull from "./saints-lives.webp";
import SaintsLivesSmall from "./saints-lives-880.webp";

type Responsive = { srcSet: string; placeholder: string };

const IMAGES: Record<string, Responsive> = {
  [LastSupperFull]: { srcSet: `${LastSupperSmall} 880w, ${LastSupperFull} 1774w`, placeholder: "data:image/webp;base64,UklGRoABAABXRUJQVlA4WAoAAAAQAAAAFwAACwAAQUxQSKwAAAABCri1batW7rMifgsu+X8NfDIGPfzw5TghdKB9WOSkWgFkluoVHEpY9+2ImACAFGg0x1WcamIg5ftIMay296+u67hPNSxM+k1ieiuHd0/hW90d0DOJgSwpd25d8G/fumhvdsskMykzZ2/BygmEJMX6dNqkTI68fXMgfQFq+YOJGR0FK/dVIL5K8bBcffTW/Vn+YW3LW/eP8luzvLz9I17r4Z/XdXEuIdCPCIl5VlA4IK4AAABwBACdASoYAAwAPt1cpkyopSOiMAgBEBuJaACdMoAlo9AAHFCt+CKDVN/wAAD+GYWGN4HKE7pqWZC1HWoIRI5PTQlHT2D+9Qp2YjNAHlA3/v0yfdb8oWg4/l96TGRM66HcXXq3dKUClWb9VzcVw6T+PDRmMma4E36SXrcqrF51zx86hqrkPpLun8ixQ9iCEmM7fEe6kWYqd7xjll/7VxhXJqH21M6sui+7NnxqgAA=" },
  [MyCornerFull]: { srcSet: `${MyCornerSmall} 880w, ${MyCornerFull} 1774w`, placeholder: "data:image/webp;base64,UklGRsoBAABXRUJQVlA4WAoAAAAQAAAAFwAACwAAQUxQSNkAAAABgLpt2/FX/fPNNpptr7GtLrktua3Zdlq0kWxv3Tab8b3v837P8ENETAD81/F1ikoPCvbQA5U6oFoHJl+e6Ut+2ynvSKzrcwMdFTo6XpckuCKIiPgC3XmALgBIelBI3xw5Ivv+FvRBKyagMv5WcFTPUaZ2Nwkk06Qnwv9CBSLD8wwDHd9BRlyFWq6cHtc6WjUxhaF6gYjI5bkyHShQmJCZ/K2aMSYL5bPKILr/kL5Iy3faGUpwCOrcHh5fm6jIy8zJL2qd3V0bn9ru8rcFsPAMBk11AMI8zQEAAFZQOCDKAAAA8AQAnQEqGAAMAD7dWqZMqKUjojAIARAbiWwAnTKBFHZEUjFQJIprGqM4dI30Ny0AAP5xyMHMHT1n3cQJRnZf4W1rKUnFdSyVb0DlurBZn27+j6iKT/qrAeWj5bM0UVowZMpTF9RW9YXL1QJyRJjp95KmAlUeGCBWdprlkDBZXsN1MD7jG4SAr056ARkBv7/cWoAiuqp7ZPfc+BahyIalWfhuogOQdQMLFznfygYlcjmTDXjZ8iFTADUl9ePZVRSFCTZSewzJ9YAAAA==" },
  [GospelTeachingFull]: { srcSet: `${GospelTeachingSmall} 880w, ${GospelTeachingFull} 1774w`, placeholder: "data:image/webp;base64,UklGRsYBAABXRUJQVlA4WAoAAAAQAAAAFwAACwAAQUxQSN0AAAABgGPb2rHnie1UdmfbdlKnyxRsdRmDndS2Stu20eX73/d93jzNryFExAQAGICBf2QpqDfxsrcEMAYAAzAva79gA7Eea52hfWc/RzvT7WYGYGBoVX/MEenqmkiQWpkKxoaQ/PqPiJyIc8m44FyhdUuAxClSoUTkAlEgokRk1OnlMf6AAnUV8jUz4JEEqpVSnUTE3+RsJlCPjHpgjBTOUai4QBRcCM7ZH925GAS9kEbJSKNSY24ALh2LIxEF1Qevkj4XBvdGa8orIsAQDAEMDAHA3Lm4ycvGJtIaAMAIAABWUDggwgAAANAEAJ0BKhgADAA+3VqmTKilI6IwCAEQG4lsAJ0ygyWPRS0zKe9cIh5VKV0aoSZAAP2zFmwUG7fnfyQdU0wdYvxGTW3lXWXHR6bfpRsB/xiE7u28Xpl/c2JI6DvSX9o8acPJIUMLGQicijrCproUN1mueFrVlfO1uuCQ5MnVWoIEciYXKZ/DRWDdNpsDv0/iLDj+zGr+Nl4IFT6rzZCwsESkYX266i27c6Jb9+9RxaqNta8qLA6goEDxBupm2fn6WAAA" },
  [DailyReadingsFull]: { srcSet: `${DailyReadingsSmall} 880w, ${DailyReadingsFull} 1774w`, placeholder: "data:image/webp;base64,UklGRsoBAABXRUJQVlA4WAoAAAAQAAAAFwAACwAAQUxQSNsAAAABgKtts2lnYtvpnHS22aW0bZuV058utu106NS5zJNL8D5rzZyJryEiJkALHHv6ejdXi+1NQQf+7fHEv143eYOejraOrq6OFgAYrrMihBCSxXEk/KkF4HOHkogIJfJCRY53SlFanAFoa1U8SyQkIkLBzAoz854zAJyyQEQiIpSKmoSi0MvDqHnEG/5KRIRIiEhIzG3pt6xGQvq/FOos751HlpIEofyBP1AtVXp+Ll3MzFLDUvyUUiLzAQBAcEXSHr9f89+ac5WVlrY2/EwON8irnZkYWTm5OhvW1wUAVlA4IMgAAACQBACdASoYAAwAPt1apkyopSOiMAgBEBuJbACdMoRwFf/i13C4Mm8MRVB3YgAA/pckiSbpQhKI8Bnx3xLIZUOOBOFL+m0ksshwFyJ77pS0Gbha12W95gAlOg8JPfUuSwru6Inr/z3fycD8Lmf9VZmx45i1ZaaS/P7yCaak/15uR/ocvbrEBhbuVaWpH9QI4XtR6KC5pXziZsWXMK03sk/n7fumXA0UbF1xLw/TcnQgDICMsrVGsGDx2fPite86i03m/5StjgAAAA==" },
  [BibleQuestionsFull]: { srcSet: `${BibleQuestionsSmall} 880w, ${BibleQuestionsFull} 1774w`, placeholder: "data:image/webp;base64,UklGRvYBAABXRUJQVlA4WAoAAAAQAAAAFwAACwAAQUxQSPQAAAABkLNtmyHZ0r/qWSOyIhuZN7JtK97MkW3btlMz3kiReezqrurvOCImAACAgI6fNoCCKAQBQCDwV0KUgkqafXM14U8iABDyhwDe27M91WuzUYZBdjYA3i4AAhDBqrRk94wjIn9A9u3QJ74lSh8EAs7Zk59RouIPjpQzfJvTdTzuSpSdC2eqqMT+TZHWbg1kKEP6VEe//D9c5OL5TpKqQ35B6TP/C/8740h73SOWht9yKjJJYoxxziTGmCjLeX6114iIHBGRi1RGRqmIm04mpsrJ4ZGn9NPzyw8Z8esVR8QxdWX4q8LJTM/EIWKk00ktsGm4QQkAVlA4INwAAACwBACdASoYAAwAPt1apkyopSOiMAgBEBuJbACdMoEUeERMJzRuA5C0KdLuNFIAAP4nKiS3Kcr6Ms2uf7yfiAWDTRPaDqqQwqNKvHnxB8Q1NkYhbTm9q1GGO8WPW51Pe4GIulsGBr0Sx7fxL7h/HJtM+RYGEIGKwRZeWKiNsJ/DRx4gbP/O+Fu2q44kaf4A4hrEprBkg7cV1+x83acuffh95wxZT2qpWMurCUZdwQcuK/Q+DBGhM91s8JKRp8KnKiksTGb7P0P32UB6ZWftVn3T/p364P+px9HNAAAA" },
  [PrayersFull]: { srcSet: `${PrayersSmall} 880w, ${PrayersFull} 1774w`, placeholder: "data:image/webp;base64,UklGRgACAABXRUJQVlA4WAoAAAAQAAAAFwAACwAAQUxQSPAAAAABkCsAsGlHcxHbtq3eSeWUtm07lVUZVdbst9vetm3fe2buLP8hIiYA/pYUSG2FwvWXJ5NAleC/kgRQsxO8yWzw13IAkP4F4LF2DfpZE6gZ3OCswr/tCme4M4Q1JEJBX5eKrBQASQ0Z6ap713nO0IkQUeenAxMBkiSrxTOTR74jIxESoTAeVBZngwzWeTeYDRJI+BeSoZ0aCYSgjZbz9AP/SYSIhMQ3+2Pbag5O60IIQiT8C1HT8XCxo1n98Q/MrAmha0JoAgU/ODtsC2Dbe/zxm3f8fxKXc30BJAkcHMNiI/cv3Dsze/XWyZHkLAsACQBWUDgg6gAAAFAFAJ0BKhgADAA+3VqmTKilI6IwCAEQG4lsAJ0yhHgmqM/Wb4JSIf0AASij8BM86nS58ADvpS6IsvnU/OgCnhU3Phdbxq3T6at0nFTt0EEz5fCAwTPGm6Golo6SnCAV+o3rK5VnGirTv+1vZCB+vh8rb9QeTpqcVSIfJzccEc7bWahJr/mXg0QnEtod5CR2mJQ2wOwBktr93cNC0vdX5eyAvn70628pZgE4MvFyQ5zPpdK4a/JXiH+JPx5VNH/j/j16/YXkjeFuKzDevx+v7r/+MBY3P8QL7v/wRT+cF8t7IMuadVS8lsAAAA==" },
  [PsalmsFull]: { srcSet: `${PsalmsSmall} 880w, ${PsalmsFull} 1774w`, placeholder: "data:image/webp;base64,UklGRuoBAABXRUJQVlA4WAoAAAAQAAAAFwAACwAAQUxQSPAAAAABgGpr27Hp+ce2Z5rtqcYJTDIik+1k22o2u5qRbevV/4Tv+84hIhS2bYO0HcMhAKAC0PfzjdGzdgINlVTJqQLXzN3BPPfc+9d4AA1QJCrw6P/DJJX3P+KOgwM46Mr+qFRuDXv4P1O+hoR/fl6tXYzneEjnYBV0pKaIyIVQo0S2HWkFGnqQ8MM5I4RzzhkjjDKcNdeGxNYN6VZwLqS+bPW30sAn/QD/BBeySoFfXLQPKT5DpJwJRWSMIvKlMJVrxuAhcqSEUEoJQYGP0/WhBiowtHRdFzeo4NPvZZSRM4DssXacY25P2URX+XC1S5i91AFWUDgg1AAAANAEAJ0BKhgADAA+3VqmTKilI6IwCAEQG4lsAJ0yhHcNQAJmINLOY6+3vJRFDCAAAP6jLFi3OcQ7Zj+EGfOHRsZGYriz49n1Ecgw6siEoZ2JJsWsQYWQO2/RCCFNvHyb8XYRduRup999jU5tHPQnnrvL2Kp7UrL+W4lzbRG7ciUxuxM8ZbKu28AWsXwv5Cw04wKdJbjUPVjaAFo1slOnt9LQZypSaAhPiAhpe7IHs7KjKClfs/F6Y465Ln3TU/gyE5DNV3A5sqOFIoQHUXcBuYl8wAAA" },
  [SaintsLivesFull]: { srcSet: `${SaintsLivesSmall} 880w, ${SaintsLivesFull} 1774w`, placeholder: "data:image/webp;base64,UklGRuoBAABXRUJQVlA4WAoAAAAQAAAAFwAACwAAQUxQSOgAAAABgHJbkyJ3QrVMLszMzIlkdqQYbRSTjGJQrHLiYtGuDWhGx5zMTFVPiZnZiJgAADAB2MBjtZsASgf6wwFMoG+OHN2Yat1rjvMy83mLBbQms6nIK/GTyh/njIrEuyVOE2i3HplkJlllmYjofX0nAEzgzNhjiXSRtOrLeLDVZPHreiIkEoKE0AiFr0ec4Mxe+Rekr0cKn/WHphxJSL4KIQjxZyapalBiQg0SoiAiJObV3JjRpzuVkVBlZkZUBfP9zXYOFNSFLrwK5v/jr98XZlm67Y+pyTCZAMAU2jjdUgg56WENLXlZAaAFVlA4INwAAACQBACdASoYAAwAPt1apkyopSOiMAgBEBuJbACdMoRwAdBw4iRSZWi6zLiGgAAA/rwqAh3AqObb5J7vw5YSFNujnKks3W+leixQn2jFkWgPbtBL0l8cXWLFI8wH9/tJwE42yGqRZO9n9H9SvL67nLGhd3zEVeNFQfxceSjEZ4G2T5rNPWVegWglhrfo30OA90AOlVRhCn8ldDOLeZc8qCoD5vj5ZE+X7yheqg6vvsH2erj5uF8vDcFd2M/obG/982c58Mb0vm6x9M/p/z/x7Bssi3/pxa/5qadD5+AA" },
};

/** srcSet and blurred preview for one of the large images, if it has them. */
export function responsiveImage(src: string): Responsive | null {
  return IMAGES[src] ?? null;
}
