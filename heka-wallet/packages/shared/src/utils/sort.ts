export function randomSort<Item>(arr: Array<Item>): Array<Item> {
  return arr.sort(() => (Math.random() > 0.5 ? 1 : -1))
}
