Feature: Items
  A tenant keeps a list of named items, and refers to each one by its name.

  Rule: A name is used by at most one item of a tenant

    Example: A second item cannot take a name already in use
      Given Acme has an item called "Blue widget"
      When Acme adds an item called "Blue widget"
      Then Acme is told the name is already taken
      And Acme has 1 item

    Example: Another tenant may use the same name
      Given Acme has an item called "Blue widget"
      When Globex adds an item called "Blue widget"
      Then Globex's items are "Blue widget"

    Example: An item cannot be renamed to a name in use
      Given Acme has items called "Blue widget" and "Green widget"
      When Acme renames "Green widget" to "Blue widget"
      Then Acme is told the name is already taken

  Rule: A name is 1 to 100 characters, without surrounding spaces

    Example: Surrounding spaces are dropped
      When Acme adds an item called "  Red widget  "
      Then Acme's items are "Red widget"

    Example: A blank name is refused
      When Acme adds an item called "   "
      Then Acme is told the name is invalid

  Rule: A renamed item keeps its place in the list

    Example: Renaming an item
      Given Acme has items called "Blue widget" and "Green widget"
      When Acme renames "Blue widget" to "Navy widget"
      Then Acme's items are "Navy widget" and "Green widget"
